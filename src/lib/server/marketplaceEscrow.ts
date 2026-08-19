import "server-only";

import { eq } from "drizzle-orm";
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
type BidClearReason = Exclude<EscrowReason, "user_cancel">;

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
  reason: EscrowReason,
) {
  const subject =
    reason === "expired"
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
  reason: EscrowReason,
) {
  const gold = listing.highestBid ?? 0;
  if (listing.bidResolvedAt || !listing.highestBidderId || gold <= 0) return 0;
  await tx.insert(marketplaceInbox).values(
    inboxValues({
      userId: listing.highestBidderId,
      payload: { kind: "bid_refund", gold },
      message: bidRefundMessage(listing.itemName, gold, reason),
    }),
  );
  await tx
    .update(marketplaceListingsV2)
    .set({
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: reason === "trade_suspension" ? null : now,
    })
    .where(eq(marketplaceListingsV2.id, listing.id));
  return gold;
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
  const refundedGold = await refundMarketplaceHighestBid(tx, listing, now, reason);
  return { cleared: refundedGold > 0, refundedGold };
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
