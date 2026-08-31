import { and, asc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, marketplaceListingsV2 } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { inboxValues } from "@/lib/server/inboxPayload";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  isMarketKind,
  isStackableMarketplaceItem,
  isTradableMarketplaceMaterial,
  isValidMaterialQty,
  marketplacePartialPrice,
  marketplaceTaxRateForAdventureSupport,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { deliverMarketplaceListing } from "@/lib/server/marketplaceV2Fulfillment";
import { adventureSupportTier } from "@/adventure/data/v2/adventureSupport";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse,
} from "@/lib/server/tradeSuspension";
import {
  clearMarketplaceHighestBid,
  unresolvedMarketplaceHighestBidderId,
} from "@/lib/server/marketplaceEscrow";

type CharSave = {
  gold?: number;
  bankedGold?: number;
  adventureSupport?: unknown;
  [key: string]: unknown;
};

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

// POST /api/v2/marketplace/buy-stack
// 같은 재료·음식·스택 소모품의 고정가 매물을 개당 가격이 낮은 순서로 부분 체결한다.
// 기존 listing.price(매물 총액) 스키마는 유지하고, 일부 체결분은 sold 행으로 남긴 뒤
// 잔여 수량을 새 active 행으로 분리해 거래 내역·시세·에스크로 감사를 보존한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return bad("unauthorized", 401);
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:marketplace:buy-stack",
    userLimit: 40,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: {
    kind?: unknown;
    itemId?: unknown;
    quantity?: unknown;
    maxTotalPrice?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("invalid_json");
  }
  if (!isMarketKind(body.kind) || body.kind === "equip") {
    return bad("bad_kind");
  }
  if (typeof body.itemId !== "string") return bad("bad_item");
  if (!isValidMaterialQty(body.quantity)) return bad("bad_quantity");
  if (
    typeof body.maxTotalPrice !== "number" ||
    !Number.isInteger(body.maxTotalPrice) ||
    body.maxTotalPrice < 1
  ) {
    return bad("bad_price");
  }
  if (!isStackableMarketplaceItem(body.kind, body.itemId)) {
    return bad("not_stackable");
  }
  if (
    body.kind === "material" &&
    !isTradableMarketplaceMaterial(body.itemId)
  ) {
    return bad("not_tradable");
  }

  const kind = body.kind;
  const itemId = body.itemId;
  const requestedQuantity = body.quantity;
  const maxTotalPrice = body.maxTotalPrice;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const probedCandidates = await tx
      .select()
      .from(marketplaceListingsV2)
      .where(
        and(
          eq(marketplaceListingsV2.status, "active"),
          eq(marketplaceListingsV2.kind, kind),
          eq(marketplaceListingsV2.itemId, itemId),
          ne(marketplaceListingsV2.sellerId, userId),
          lte(marketplaceListingsV2.bidEndsAt, now),
          gt(marketplaceListingsV2.expiresAt, now),
          or(
            isNull(marketplaceListingsV2.highestBid),
            sql`${marketplaceListingsV2.highestBid} <= ${marketplaceListingsV2.price}`,
          ),
        ),
      )
      .orderBy(
        asc(
          sql`ceil(${marketplaceListingsV2.price}::numeric / greatest(${marketplaceListingsV2.quantity}, 1))`,
        ),
        asc(marketplaceListingsV2.createdAt),
      )
      .limit(100);
    const probedListingIds = probedCandidates.map((listing) => listing.id);
    const participantIds = [
      userId,
      ...probedCandidates.flatMap((listing) => {
        const bidderId = unresolvedMarketplaceHighestBidderId(listing);
        return [listing.sellerId, ...(bidderId ? [bidderId] : [])];
      }),
    ];
    await requireTradeParticipants(tx, participantIds, now);

    const candidates =
      probedListingIds.length === 0
        ? []
        : await tx
            .select()
            .from(marketplaceListingsV2)
            .where(
              and(
                inArray(marketplaceListingsV2.id, probedListingIds),
                eq(marketplaceListingsV2.status, "active"),
                eq(marketplaceListingsV2.kind, kind),
                eq(marketplaceListingsV2.itemId, itemId),
                ne(marketplaceListingsV2.sellerId, userId),
                lte(marketplaceListingsV2.bidEndsAt, now),
                gt(marketplaceListingsV2.expiresAt, now),
                or(
                  isNull(marketplaceListingsV2.highestBid),
                  sql`${marketplaceListingsV2.highestBid} <= ${marketplaceListingsV2.price}`,
                ),
              ),
            )
            .orderBy(asc(marketplaceListingsV2.id))
            .for("update");
    const prelockedParticipants = new Set(participantIds);
    candidates.sort((left, right) => {
      const unitPrice = (listing: (typeof candidates)[number]) =>
        Math.ceil(listing.price / Math.max(1, listing.quantity));
      return (
        unitPrice(left) - unitPrice(right) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id - right.id
      );
    });

    let remaining = requestedQuantity;
    const fills: Array<{
      listing: (typeof candidates)[number];
      quantity: number;
      price: number;
      proceeds: number;
      taxRate: number;
    }> = [];
    const sellerTaxRates = new Map<string, number>();

    for (const listing of candidates) {
      if (remaining <= 0) break;
      const bidderId = unresolvedMarketplaceHighestBidderId(listing);
      if (
        !prelockedParticipants.has(listing.sellerId) ||
        (bidderId != null && !prelockedParticipants.has(bidderId))
      ) {
        continue;
      }
      let take = Math.min(remaining, listing.quantity);
      let fillPrice = marketplacePartialPrice(
        listing.price,
        listing.quantity,
        take,
      );
      // 가격이 1골드인 오래된 묶음은 양쪽 매물에 양의 가격을 남길 수 없으므로
      // 요청이 전체 수량을 담을 수 있을 때만 통째로 체결한다.
      if (fillPrice == null) {
        if (remaining < listing.quantity) continue;
        take = listing.quantity;
        fillPrice = listing.price;
      }
      let taxRate = sellerTaxRates.get(listing.sellerId);
      if (taxRate == null) {
        const sellerCharacter = await readSave<CharSave>(
          tx,
          listing.sellerId,
          "character.v2",
          {},
        );
        taxRate = marketplaceTaxRateForAdventureSupport(
          adventureSupportTier(sellerCharacter.adventureSupport),
        );
        sellerTaxRates.set(listing.sellerId, taxRate);
      }
      fills.push({
        listing,
        quantity: take,
        price: fillPrice,
        proceeds: saleProceeds(fillPrice, taxRate),
        taxRate,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_stock",
          available: requestedQuantity - remaining,
        },
      };
    }

    const totalPrice = fills.reduce((sum, fill) => sum + fill.price, 0);
    if (totalPrice > maxTotalPrice) {
      return {
        status: 409,
        body: { ok: false as const, error: "price_changed", totalPrice },
      };
    }
    const charSave = await lockSaveForUpdate<CharSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const spend = spendGold(
      Math.max(0, Math.floor(charSave.gold ?? 0)),
      Math.max(0, Math.floor(charSave.bankedGold ?? 0)),
      totalPrice,
    );
    if (!spend.ok) {
      return {
        status: 400,
        body: { ok: false as const, error: "insufficient_gold" },
      };
    }
    const nextChar = {
      ...charSave,
      gold: spend.gold,
      bankedGold: spend.bankedGold,
    };
    await upsertSave(tx, userId, "character.v2", nextChar);

    for (const fill of fills) {
      const { listing } = fill;
      const deliveryError = await deliverMarketplaceListing(tx, userId, {
        ...listing,
        quantity: fill.quantity,
        price: fill.price,
      });
      if (deliveryError) {
        throw new Error(`marketplace_stack_delivery_failed:${deliveryError}`);
      }

      await clearMarketplaceHighestBid(tx, listing, now, "expired");

      await tx
        .update(marketplaceListingsV2)
        .set({
          status: "sold",
          quantity: fill.quantity,
          price: fill.price,
          buyerId: userId,
          bidResolvedAt: now,
          closedAt: now,
        })
        .where(eq(marketplaceListingsV2.id, listing.id));

      const remainderQuantity = listing.quantity - fill.quantity;
      if (remainderQuantity > 0) {
        await tx.insert(marketplaceListingsV2).values({
          sellerId: listing.sellerId,
          sellerName: listing.sellerName,
          kind: listing.kind,
          itemId: listing.itemId,
          itemName: listing.itemName,
          quantity: remainderQuantity,
          price: listing.price - fill.price,
          instancePayload: listing.instancePayload,
          status: "active",
          createdAt: listing.createdAt,
          bidEndsAt: listing.bidEndsAt,
          expiresAt: listing.expiresAt,
          highestBid: null,
          highestBidderId: null,
          bidCount: 0,
          bidResolvedAt: now,
        });
      }

      if (fill.proceeds > 0) {
        await tx.insert(marketplaceInbox).values(
          inboxValues({
            userId: listing.sellerId,
            payload: { kind: "sale_proceeds", gold: fill.proceeds },
            message: `${listing.itemName} ${fill.quantity.toLocaleString()}개 판매 대금 ${fill.proceeds.toLocaleString()}골드`,
          }),
        );
      }
    }

    return {
      status: 200,
      fills: fills.map((fill) => ({
        listingId: fill.listing.id,
        sellerId: fill.listing.sellerId,
        quantity: fill.quantity,
        price: fill.price,
        proceeds: fill.proceeds,
        taxRate: fill.taxRate,
      })),
      body: {
        ok: true as const,
        itemName: fills[0]?.listing.itemName ?? itemId,
        quantity: requestedQuantity,
        paid: totalPrice,
        gold: nextChar.gold,
        ...(V2_CORE_LOOP_V2 ? { bankedGold: nextChar.bankedGold } : {}),
      },
    };
  }).catch((error) => {
    if (error instanceof TradeSuspendedError) return tradeSuspendedResponse(error);
    throw error;
  });
  if (result instanceof Response) return result;

  if (result.status === 200 && "fills" in result) {
    for (const fill of result.fills ?? []) {
      recordEconomyEventSoon({
        userId,
        counterpartyUserId: fill.sellerId,
        eventType: "marketplace.buy",
        goldDelta: -fill.price,
        itemKind: kind,
        itemId,
        quantity: fill.quantity,
        detail: { listingId: fill.listingId, stackPurchase: true },
      });
      recordEconomyEventSoon({
        userId: fill.sellerId,
        counterpartyUserId: userId,
        eventType: "marketplace.sell",
        goldDelta: fill.proceeds,
        itemKind: kind,
        itemId,
        quantity: fill.quantity,
        detail: {
          listingId: fill.listingId,
          grossGold: fill.price,
          taxRate: fill.taxRate,
          stackPurchase: true,
        },
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
