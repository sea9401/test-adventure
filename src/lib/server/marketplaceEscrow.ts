import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { marketplaceBuyOrdersV2, marketplaceInbox, marketplaceListingsV2 } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import {
  addMuseunCashItem,
  isMuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  addCookingFood,
  isCookingFoodId,
} from "@/adventure/v2/cooking";
import { restoreMarketplaceRareMap } from "@/lib/server/marketplaceV2";
import { deliverFishSpecimenStack } from "@/lib/server/marketplaceV2Fulfillment";
import { inboxValues } from "@/lib/server/inboxPayload";

export type MarketplaceListingRow = typeof marketplaceListingsV2.$inferSelect;
export type MarketplaceBuyOrderRow = typeof marketplaceBuyOrdersV2.$inferSelect;

type EscrowReason = "user_cancel" | "trade_suspension" | "expired";
type BidClearReason = Exclude<EscrowReason, "user_cancel"> | "account_delete";
type BidRefundReason = EscrowReason | "account_delete";

type CharSave = {
  rareMaps?: unknown;
  cashItems?: unknown;
  materials?: Record<string, number>;
  [key: string]: unknown;
};

type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
};

function buyOrderRefundMessage(
  itemName: string,
  gold: number,
  reason: EscrowReason,
) {
  const subject =
    reason === "user_cancel"
      ? "구매 주문 취소"
      : reason === "expired"
        ? "구매 주문 만료"
        : "구매 주문 거래 제한 해제";
  return `${itemName} ${subject} · ${gold.toLocaleString()}골드 반환`;
}

function bidRefundMessage(
  itemName: string,
  gold: number,
  reason: BidRefundReason,
) {
  const subject =
    reason === "account_delete"
      ? "판매자 탈퇴"
      : reason === "expired"
        ? "유예 종료"
        : reason === "user_cancel"
          ? "매물 취소"
          : "거래 제한 해제";
  return `${itemName} ${subject} · ${gold.toLocaleString()}골드 반환`;
}

async function restoreMarketplaceListingEscrow(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  now: Date,
) {
  if (listing.kind === "equip") {
    await appendEquipInstances(tx, listing.sellerId, [
      mintListedEquipInstance(
        listing.itemId as V2EquipmentId,
        listing.instancePayload,
      ),
    ]);
    return;
  }

  const charSave = await lockSaveForUpdate<CharSave>(
    tx,
    listing.sellerId,
    "character.v2",
    {},
  );
  if (listing.kind === "consumable") {
    if (
      await deliverFishSpecimenStack(
        tx,
        listing.sellerId,
        listing.itemId,
        listing.quantity,
      )
    ) {
      return;
    }
    if (isMuseunCashItemId(listing.itemId)) {
      await upsertSave(tx, listing.sellerId, "character.v2", {
        ...charSave,
        cashItems: addMuseunCashItem(
          charSave.cashItems,
          listing.itemId,
          listing.quantity,
        ),
      });
      return;
    }
    if (isCookingFoodId(listing.itemId)) {
      const inventory = await lockSaveForUpdate<InventorySave>(
        tx,
        listing.sellerId,
        "inventory.v2",
        {},
      );
      await upsertSave(tx, listing.sellerId, "inventory.v2", {
        ...inventory,
        cookingFoods: addCookingFood(
          inventory.cookingFoods,
          listing.itemId,
          listing.quantity,
        ),
      });
      return;
    }
    const restored = restoreMarketplaceRareMap(
      listing.instancePayload,
      now.getTime(),
      { preserveIid: true },
    );
    if (restored) {
      await upsertSave(tx, listing.sellerId, "character.v2", {
        ...charSave,
        rareMaps: [...parseRareMaps(charSave.rareMaps, now.getTime()), restored],
      });
    }
    return;
  }

  const materials = { ...(charSave.materials ?? {}) };
  materials[listing.itemId] =
    Math.max(0, Math.floor(materials[listing.itemId] ?? 0)) + listing.quantity;
  await upsertSave(tx, listing.sellerId, "character.v2", {
    ...charSave,
    materials,
  });
}

async function refundMarketplaceHighestBid(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  now: Date,
  reason: BidRefundReason,
) {
  const gold = listing.highestBid ?? 0;
  if (listing.bidResolvedAt) {
    await discardMarketplaceHighestBid(tx, listing);
    return 0;
  }
  const bidderId = listing.highestBidderId;
  if (!bidderId || gold <= 0) {
    if (reason === "expired") {
      await tx
        .update(marketplaceListingsV2)
        .set({ highestBid: null, highestBidderId: null, bidResolvedAt: now })
        .where(
          and(
            eq(marketplaceListingsV2.id, listing.id),
            eq(marketplaceListingsV2.status, "active"),
            isNull(marketplaceListingsV2.bidResolvedAt),
          ),
        );
    }
    return 0;
  }

  // The conditional update claims this exact unresolved escrow before the
  // refund row is inserted. A stale caller therefore cannot refund the same
  // bid twice; a later insert failure rolls the claim back with the tx.
  const [cleared] = await tx
    .update(marketplaceListingsV2)
    .set({
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: reason === "trade_suspension" ? null : now,
    })
    .where(
      and(
        eq(marketplaceListingsV2.id, listing.id),
        eq(marketplaceListingsV2.status, "active"),
        isNull(marketplaceListingsV2.bidResolvedAt),
        eq(marketplaceListingsV2.highestBidderId, bidderId),
        eq(marketplaceListingsV2.highestBid, gold),
        eq(marketplaceListingsV2.bidCount, listing.bidCount),
      ),
    )
    .returning({ id: marketplaceListingsV2.id });
  if (!cleared) return 0;

  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: bidderId,
      payload: { kind: "bid_refund", gold },
      message: bidRefundMessage(listing.itemName, gold, reason),
    }),
  );
  return gold;
}

export function unresolvedMarketplaceHighestBidderId(
  listing: Pick<
    MarketplaceListingRow,
    "bidResolvedAt" | "highestBid" | "highestBidderId"
  >,
): string | null {
  return !listing.bidResolvedAt &&
    listing.highestBidderId &&
    (listing.highestBid ?? 0) > 0
    ? listing.highestBidderId
    : null;
}

export async function clearMarketplaceHighestBid(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  now: Date,
  reason: BidClearReason,
): Promise<{ cleared: boolean; refundedGold: number }> {
  if (listing.status !== "active") {
    return { cleared: false, refundedGold: 0 };
  }
  const refundedGold = await refundMarketplaceHighestBid(
    tx,
    listing,
    now,
    reason,
  );
  return { cleared: refundedGold > 0, refundedGold };
}

export async function discardMarketplaceHighestBid(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
): Promise<{ cleared: boolean }> {
  const bidderId = listing.highestBidderId;
  const gold = listing.highestBid;
  if (!bidderId || !gold) return { cleared: false };
  if (listing.status !== "active" || listing.bidResolvedAt) {
    // Account deletion also needs to remove historical bidder references:
    // ON DELETE SET NULL on bidder_id alone would violate the bid-pair check.
    // These rows are already locked by lockActiveTradeExposure's historical
    // mode, so an exact guarded update is sufficient and never refunds gold.
    await tx
      .update(marketplaceListingsV2)
      .set({ highestBid: null, highestBidderId: null })
      .where(
        and(
          eq(marketplaceListingsV2.id, listing.id),
          eq(marketplaceListingsV2.status, listing.status),
          eq(marketplaceListingsV2.highestBidderId, bidderId),
          eq(marketplaceListingsV2.highestBid, gold),
          eq(marketplaceListingsV2.bidCount, listing.bidCount),
          listing.bidResolvedAt
            ? eq(marketplaceListingsV2.bidResolvedAt, listing.bidResolvedAt)
            : isNull(marketplaceListingsV2.bidResolvedAt),
        ),
      );
    return { cleared: true };
  }
  const [cleared] = await tx
    .update(marketplaceListingsV2)
    .set({ highestBid: null, highestBidderId: null, bidResolvedAt: null })
    .where(
      and(
        eq(marketplaceListingsV2.id, listing.id),
        eq(marketplaceListingsV2.status, "active"),
        isNull(marketplaceListingsV2.bidResolvedAt),
        eq(marketplaceListingsV2.highestBidderId, bidderId),
        eq(marketplaceListingsV2.highestBid, gold),
        eq(marketplaceListingsV2.bidCount, listing.bidCount),
      ),
    )
    .returning({ id: marketplaceListingsV2.id });
  return { cleared: Boolean(cleared) };
}

export async function cancelMarketplaceListingEscrow(
  tx: DbExecutor,
  listing: MarketplaceListingRow,
  options: {
    now: Date;
    refundHighestBid: boolean;
    reason: EscrowReason;
  },
): Promise<{ cancelled: boolean; refundedBidGold: number }> {
  if (listing.status !== "active") {
    return { cancelled: false, refundedBidGold: 0 };
  }

  await restoreMarketplaceListingEscrow(tx, listing, options.now);
  const refundedBidGold = options.refundHighestBid
    ? await refundMarketplaceHighestBid(tx, listing, options.now, options.reason)
    : 0;
  await tx
    .update(marketplaceListingsV2)
    .set({
      status: options.reason === "expired" ? "expired" : "cancelled",
      closedAt: options.now,
    })
    .where(eq(marketplaceListingsV2.id, listing.id));
  return { cancelled: true, refundedBidGold };
}

export async function cancelMarketplaceBuyOrderEscrow(
  tx: DbExecutor,
  order: MarketplaceBuyOrderRow,
  now: Date,
  reason: EscrowReason,
): Promise<{ cancelled: boolean; refundedGold: number }> {
  if (order.status !== "active") {
    return { cancelled: false, refundedGold: 0 };
  }
  const refundedGold = order.goldEscrow;
  if (refundedGold > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: order.buyerId,
        payload: { kind: "buy_order_refund", gold: refundedGold },
        message: buyOrderRefundMessage(order.itemName, refundedGold, reason),
      }),
    );
  }
  await tx
    .update(marketplaceBuyOrdersV2)
    .set({
      status: reason === "expired" ? "expired" : "cancelled",
      goldEscrow: 0,
      closedAt: now,
    })
    .where(eq(marketplaceBuyOrdersV2.id, order.id));
  return { cancelled: true, refundedGold };
}
