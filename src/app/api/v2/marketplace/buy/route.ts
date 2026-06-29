import { eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  genEquipIid,
  parseEquipmentSave,
  parseEquipRoll,
  parseCraftedBy,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { parseEnhance } from "@/adventure/data/v2/v2Enhance";
import {
  resolvePlayerName,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import {
  RARE_MAP_CAP,
  genRareMapIid,
  parseRareMaps,
} from "@/adventure/data/v2/rareMaps";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";

// POST /api/v2/marketplace/buy — 매물 구매(원자적).
//   body: { listingId:int }
// 흐름: listing 행 FOR UPDATE 잠금 → status active 재확인 → 본인 매물 금지 → 구매자 골드 차감
//   → 아이템을 구매자 save 합류(장비=새 개체, 재료=수량 가산) → listing sold 마킹
//   → 판매자에게 sale_proceeds 우편(대금−판매세; 세금분 소각). 판매자 save 는 잠그지 않음(우편 정산).
// 잠금 순서: listing → 구매자 character.v2 → 구매자 equipment.v2 (교차 유저 save 락 없음 = 데드락 회피).

type CharSave = {
  gold?: number;
  materials?: Record<string, number>;
  rareMaps?: unknown;
  [k: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);

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

  const result = await db.transaction(async (tx) => {
    // 1) listing 행 잠금 + 활성 재확인(동시 구매 직렬화).
    const [listing] = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.id, listingId))
      .for("update");
    if (!listing) return { status: 404, body: { ok: false as const, error: "not_found" } };
    if (listing.status !== "active") {
      return { status: 409, body: { ok: false as const, error: "not_available" } };
    }
    if (listing.sellerId === userId) {
      return { status: 400, body: { ok: false as const, error: "own_listing" } };
    }

    // 1-b) 소모품(레어맵) — 실물 유효성 검증(시간 만료 폐지 2026-06-22, 판수 소진/불량
    //   스냅샷만 죽은 매물). 죽었으면 매물 자체를 expired 처리(대금 이동 0, 그대로 소멸).
    if (listing.kind === "consumable") {
      const inst = parseRareMaps([listing.instancePayload], Date.now())[0];
      if (!inst) {
        await tx
          .update(marketplaceListingsV2)
          .set({ status: "expired", closedAt: new Date() })
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
    let nextChar: CharSave = { ...charSave, gold: spend.gold, bankedGold: spend.bankedGold };

    // 3) 아이템을 구매자에게 지급.
    if (listing.kind === "equip") {
      const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const { owned, equipped } = parseEquipmentSave(equipSave);
      // payload = 굴림(+강화) — 옛 행은 raw roll. 방어 파스로 양형 흡수(강화 승계).
      const payloadRaw = listing.instancePayload as
        | (Record<string, unknown> & { craftedBy?: unknown; enhance?: unknown })
        | null;
      const roll = parseEquipRoll(payloadRaw ?? undefined);
      const enhance = parseEnhance(payloadRaw?.enhance);
      const craftedBy = parseCraftedBy(payloadRaw?.craftedBy);
      const nextOwned = [
        ...owned,
        {
          iid: genEquipIid(),
          id: listing.itemId as V2EquipmentId,
          ...(roll ? { roll } : {}),
          ...(enhance ? { enhance } : {}),
          ...(craftedBy ? { craftedBy } : {}),
        },
      ];
      await upsertSave(tx, userId, "equipment.v2", { owned: nextOwned, equipped });
      await upsertSave(tx, userId, "character.v2", nextChar);
    } else if (listing.kind === "consumable") {
      // 레어맵 — 구매자 rareMaps 합류(새 iid — 교차 유저 충돌 방지). 보유 캡 초과 거부
      //   (골드 차감 전 검증이 아니라 차감 후 같은 분기지만 tx 라 원자적 — 거부 시 전체 롤백).
      const myMaps = parseRareMaps(charSave.rareMaps, Date.now());
      if (myMaps.length >= RARE_MAP_CAP) {
        return {
          status: 400,
          body: { ok: false as const, error: "rare_map_cap" },
        };
      }
      const inst = parseRareMaps([listing.instancePayload], Date.now())[0]!;
      nextChar = {
        ...nextChar,
        rareMaps: [...myMaps, { ...inst, iid: genRareMapIid() }],
      };
      await upsertSave(tx, userId, "character.v2", nextChar);
    } else {
      // material — 구매자 재료 수량 가산(character.v2 에 누적).
      const mats = { ...(nextChar.materials ?? {}) };
      mats[listing.itemId] = Math.max(0, Math.floor(mats[listing.itemId] ?? 0)) + listing.quantity;
      nextChar = { ...nextChar, materials: mats };
      await upsertSave(tx, userId, "character.v2", nextChar);
    }

    // 4) listing sold 마킹.
    await tx
      .update(marketplaceListingsV2)
      .set({ status: "sold", buyerId: userId, closedAt: new Date() })
      .where(eq(marketplaceListingsV2.id, listingId));

    // 5) 판매자 정산 우편 — 대금 − 판매세(세금분 소각). 판매자 오프라인이어도 우편으로 수령.
    // ⚠️ listingId 는 넣지 않는다 — marketplace_inbox.listing_id 는 **v1** marketplace_listings
    //   FK 라 v2 리스팅 id 를 넣으면 FK 위반(23503)으로 구매 tx 전체가 롤백되던 라이브 버그
    //   (#577 부터 잠복 — v1 테이블에 우연히 같은 id 가 있을 때만 통과). 정산 우편은
    //   message/payload 로 충분, v2 리스팅 추적은 listings_v2.buyerId/closedAt 이 담당.
    const proceeds = saleProceeds(listing.price);
    const buyerName = (await resolvePlayerName(tx, userId)) ?? "구매자";
    if (proceeds > 0) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.sellerId,
          payload: { kind: "sale_proceeds", gold: proceeds },
          message: `${listing.itemName} 판매 대금 ${proceeds.toLocaleString()}골드`,
          fromUserId: userId,
          fromName: buyerName,
        }),
      );
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        itemName: listing.itemName,
        paid: listing.price,
        gold: nextChar.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: nextChar.bankedGold } : {}),
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
