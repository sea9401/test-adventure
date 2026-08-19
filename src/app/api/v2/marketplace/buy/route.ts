import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { inboxValues } from "@/lib/server/inboxPayload";
import { listedEquipEnhance } from "@/adventure/data/v2/v2EquipMint";
import {
  isTradableMaterial,
  marketplaceTaxRateForAdventureSupport,
  marketplaceListingPhase,
  restoreMarketplaceRareMap,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { deliverMarketplaceListing } from "@/lib/server/marketplaceV2Fulfillment";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { isMuseunCashItemId } from "@/adventure/data/v2/museunCashItems";
import { adventureSupportActive } from "@/adventure/data/v2/adventureSupport";
import { isCookingFoodId } from "@/adventure/v2/cooking";
import { RARE_MAP_CAP, parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { fishIdFromSpecimenItemId } from "@/adventure/v2/fishSpecimens";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";

// POST /api/v2/marketplace/buy — 매물 구매(원자적).
//   body: { listingId:int }
// 흐름: 참여자 user 행 잠금 → listing 행 FOR UPDATE 잠금 → status active 재확인
//   → 본인 매물 금지 → 구매자 골드 차감
//   → 아이템을 구매자 save 합류(장비=새 개체, 재료=수량 가산) → listing sold 마킹
//   → 판매자에게 sale_proceeds 우편(대금−판매세; 세금분 소각). 판매자 save 는 잠그지 않음(우편 정산).
// 잠금 순서: 참여자 users(ID 오름차순) → listing → 구매자 character.v2
//   → 구매자 equipment.v2 (교차 유저 save 락 없음 = 데드락 회피).

type CharSave = {
  gold?: number;
  materials?: Record<string, number>;
  rareMaps?: unknown;
  cashItems?: unknown;
  [k: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy",
    userLimit: 60,
    ipLimit: 300,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: { listingId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (typeof body.listingId !== "number" || !Number.isInteger(body.listingId)) {
    return bad("bad_listingId");
  }
  const listingId = body.listingId;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [probe] = await tx
      .select({
        sellerId: marketplaceListingsV2.sellerId,
        highestBidderId: marketplaceListingsV2.highestBidderId,
      })
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .limit(1);
    if (!probe) {
      await requireTradeParticipants(tx, [userId], now);
      return { status: 404, body: { ok: false as const, error: "not_found" } };
    }
    const participantIds = [
      userId,
      probe.sellerId,
      ...(probe.highestBidderId ? [probe.highestBidderId] : []),
    ];
    await requireTradeParticipants(tx, participantIds, now);

    // 1) 참여자 잠금 뒤 listing 행 잠금 + 활성/상대 재확인(동시 구매 직렬화).
    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .for("update");
    if (!listing) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (
      listing.sellerId !== probe.sellerId ||
      (listing.highestBidderId != null &&
        !participantIds.includes(listing.highestBidderId))
    ) {
      return { status: 409, body: { ok: false as const, error: "not_available" } };
    }
    if (listing.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_available" } };
    }
    if (listing.sellerId === userId) {
      return { status: 400, body: { ok: false as const, error: "own_listing" } };
    }
    const phase = marketplaceListingPhase(listing, now);
    if (phase === "bidding") {
      return { status: 409, body: { ok: false as const, error: "buy_pending" } };
    }
    if (phase === "auction_settlement") {
      return {
        status: 409,
        body: { ok: false as const, error: "auction_locked" },
      };
    }
    if (phase !== "fixed") {
      return { status: 409, body: { ok: false as const, error: "listing_expired" } };
    }
    if (
      !listing.bidResolvedAt &&
      listing.highestBidderId &&
      (listing.highestBid ?? 0) > 0
    ) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.highestBidderId,
          payload: { kind: "bid_refund", gold: listing.highestBid! },
          message: `${listing.itemName} 유예 종료 · ${listing.highestBid!.toLocaleString()}골드 반환`,
        }),
      );
      await tx
        .update(marketplaceListingsV2)
        .set({ bidResolvedAt: now })
        .where(eq(marketplaceListingsV2.id, listingId));
    }
    if (listing.kind === "material" && !isTradableMaterial(listing.itemId)) {
      return {
        status: 409,
        body: { ok: false as const, error: "not_available" },
      };
    }
    // 정책 변경 전에 등록된 강화 매물도 새 구매는 막는다. 판매자는 취소하거나 만료 시
    // 원형 그대로 돌려받을 수 있으므로 여기서 매물을 소멸시키지는 않는다.
    if (listing.kind === "equip" && listedEquipEnhance(listing.instancePayload)) {
      return { status: 409, body: { ok: false as const, error: "enhanced" } };
    }

    const sellerCharacter = await readSave<CharSave>(
      tx,
      listing.sellerId,
      "character.v2",
      {},
    );
    const sellerTaxRate = marketplaceTaxRateForAdventureSupport(
      adventureSupportActive(sellerCharacter.adventureSupport),
    );

    // 1-b) 소모품(레어맵) — 실물 유효성 검증(시간 만료 폐지 2026-06-22, 판수 소진/불량
    //   스냅샷만 죽은 매물). 죽었으면 매물 자체를 expired 처리(대금 이동 0, 그대로 소멸).
    if (
      listing.kind === "consumable" &&
      !isMuseunCashItemId(listing.itemId) &&
      !isCookingFoodId(listing.itemId) &&
      fishIdFromSpecimenItemId(listing.itemId) === null
    ) {
      const inst = restoreMarketplaceRareMap(listing.instancePayload, Date.now());
      if (!inst) {
        await tx
          .update(marketplaceListingsV2)
          .set({ status: "expired", closedAt: now })
          .where(eq(marketplaceListingsV2.id, listingId));
        return {
          status: 409,
          body: { ok: false as const, error: "listing_expired" },
        };
      }
    }

    // 2) 구매자 골드 차감.
    const charSave = await lockSaveForUpdate<CharSave>(tx, userId, "character.v2", {});
    const gold = Math.max(0, Math.floor(charSave.gold ?? 0));
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const spend = spendGold(gold, bankedGold, listing.price);
    if (!spend.ok) {
      return { status: 400, body: { ok: false as const, error: "insufficient_gold" } };
    }
    if (
      listing.kind === "consumable" &&
      !isMuseunCashItemId(listing.itemId) &&
      !isCookingFoodId(listing.itemId) &&
      fishIdFromSpecimenItemId(listing.itemId) === null &&
      parseRareMaps(charSave.rareMaps, Date.now()).length >= RARE_MAP_CAP
    ) {
      return {
        status: 400,
        body: { ok: false as const, error: "rare_map_cap" },
      };
    }
    const nextChar: CharSave = { ...charSave, gold: spend.gold, bankedGold: spend.bankedGold };

    // 3) 골드 차감 저장 후 아이템을 구매자에게 지급.
    await upsertSave(tx, userId, "character.v2", nextChar);
    const deliveryError = await deliverMarketplaceListing(tx, userId, listing);
    if (deliveryError) {
      // 모든 실패 조건은 골드 저장 전에 검증한다. 여기까지 왔다면 손상 데이터나
      // 예상하지 못한 경합이므로 예외로 롤백해 골드만 차감되는 일을 막는다.
      throw new Error(`marketplace_delivery_failed:${deliveryError}`);
    }

    // 4) listing sold 마킹.
    await tx
      .update(marketplaceListingsV2)
      .set({ status: "sold", buyerId: userId, closedAt: now })
      .where(eq(marketplaceListingsV2.id, listingId));

    // 5) 판매자 정산 우편 — 대금 − 판매세(세금분 소각). 판매자 오프라인이어도 우편으로 수령.
    // ⚠️ listingId 는 넣지 않는다 — marketplace_inbox.listing_id 는 **v1** marketplace_listings
    //   FK 라 v2 리스팅 id 를 넣으면 FK 위반(23503)으로 구매 tx 전체가 롤백되던 라이브 버그
    //   (#577 부터 잠복 — v1 테이블에 우연히 같은 id 가 있을 때만 통과). 정산 우편은
    //   message/payload 로 충분, v2 리스팅 추적은 listings_v2.buyerId/closedAt 이 담당.
    // 거래 상대는 익명 정책이므로 fromUserId/fromName 도 저장하지 않는다. 이를 넣으면
    // 구매자의 '보낸 우편'에 판매자가 받는 사람으로 노출된다.
    const proceeds = saleProceeds(listing.price, sellerTaxRate);
    if (proceeds > 0) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.sellerId,
          payload: { kind: "sale_proceeds", gold: proceeds },
          message: `${listing.itemName} 판매 대금 ${proceeds.toLocaleString()}골드`,
        }),
      );
    }

    return {
      status: 200,
      log: {
        sellerId: listing.sellerId,
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        price: listing.price,
        proceeds,
        taxRate: sellerTaxRate,
        listingId,
      },
      body: {
        ok: true as const,
        itemName: listing.itemName,
        paid: listing.price,
        gold: nextChar.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: nextChar.bankedGold } : {}),
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  const economyLog = result.status === 200 && "log" in result ? result.log : null;
  if (economyLog) {
    recordEconomyEventSoon({
      userId,
      counterpartyUserId: economyLog.sellerId,
      eventType: "marketplace.buy",
      goldDelta: -economyLog.price,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: { listingId: economyLog.listingId },
    });
    recordEconomyEventSoon({
      userId: economyLog.sellerId,
      counterpartyUserId: userId,
      eventType: "marketplace.sell",
      goldDelta: economyLog.proceeds,
      itemKind: economyLog.itemKind,
      itemId: economyLog.itemId,
      quantity: economyLog.quantity,
      detail: {
        listingId: economyLog.listingId,
        grossGold: economyLog.price,
        taxRate: economyLog.taxRate,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
