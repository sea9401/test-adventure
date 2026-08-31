import "server-only";

import { and, asc, eq, or } from "drizzle-orm";
import {
  marketplaceBuyOrdersV2,
  marketplaceListingsV2,
} from "@/db/schema";
import type { EconomyEventInput } from "@/lib/server/economyLog";
import {
  cancelMarketplaceBuyOrderEscrow,
  cancelMarketplaceListingEscrow,
  clearMarketplaceHighestBid,
  type MarketplaceBuyOrderRow,
  type MarketplaceListingRow,
  unresolvedMarketplaceHighestBidderId,
} from "@/lib/server/marketplaceEscrow";
import type { DbExecutor } from "@/lib/server/savesKv";
import { lockTradeParticipantStatuses } from "@/lib/server/tradeSuspension";

export type TradeExposureCleanupSummary = {
  listingsCancelled: number;
  buyOrdersCancelled: number;
  highestBidsCleared: number;
  refundedGold: number;
};

export type TradeExposureCleanupResult = TradeExposureCleanupSummary & {
  economyEvents: EconomyEventInput[];
};

export type LockedTradeExposure = {
  participantUserIds: string[];
  listings: MarketplaceListingRow[];
  buyOrders: MarketplaceBuyOrderRow[];
};

export type TradeExposureLockOptions = {
  includeHistoricalReferences?: boolean;
};

/**
 * The exposure changed between the non-locking discovery query and the
 * canonical lock phase. Callers may retry the entire transaction a bounded
 * number of times; no partial cleanup is safe to retain.
 */
export class TradeExposureChangedError extends Error {
  constructor() {
    super("trade_exposure_changed");
    this.name = "TradeExposureChangedError";
  }
}

function listingExposesUser(
  listing: MarketplaceListingRow,
  userId: string,
  options: TradeExposureLockOptions,
): boolean {
  if (options.includeHistoricalReferences) {
    return (
      listing.sellerId === userId ||
      listing.highestBidderId === userId ||
      listing.buyerId === userId
    );
  }
  return (
    listing.status === "active" &&
    (listing.sellerId === userId ||
      listing.highestBidderId === userId)
  );
}

function orderedParticipantIds(
  userId: string,
  listings: MarketplaceListingRow[],
  options: TradeExposureLockOptions,
): string[] {
  const userIds = new Set<string>([userId]);
  for (const listing of listings) {
    userIds.add(listing.sellerId);
    if (options.includeHistoricalReferences) {
      if (listing.highestBidderId) userIds.add(listing.highestBidderId);
      if (listing.buyerId) userIds.add(listing.buyerId);
    } else {
      const bidderId = unresolvedMarketplaceHighestBidderId(listing);
      if (bidderId) userIds.add(bidderId);
    }
  }
  return [...userIds].sort((a, b) => a.localeCompare(b));
}

async function probeActiveTradeExposure(
  tx: DbExecutor,
  userId: string,
  options: TradeExposureLockOptions,
): Promise<{
  listings: MarketplaceListingRow[];
  buyOrders: MarketplaceBuyOrderRow[];
}> {
  const [listingRows, buyOrders] = await Promise.all([
    tx
      .select()
      .from(marketplaceListingsV2)
      .where(
        options.includeHistoricalReferences
          ? or(
              eq(marketplaceListingsV2.sellerId, userId),
              eq(marketplaceListingsV2.highestBidderId, userId),
              eq(marketplaceListingsV2.buyerId, userId),
            )
          : and(
              eq(marketplaceListingsV2.status, "active"),
              or(
                eq(marketplaceListingsV2.sellerId, userId),
                eq(marketplaceListingsV2.highestBidderId, userId),
              ),
            ),
      )
      .orderBy(asc(marketplaceListingsV2.id)),
    tx
      .select()
      .from(marketplaceBuyOrdersV2)
      .where(
        and(
          eq(marketplaceBuyOrdersV2.buyerId, userId),
          eq(marketplaceBuyOrdersV2.status, "active"),
        ),
      )
      .orderBy(asc(marketplaceBuyOrdersV2.id)),
  ]);
  return {
    listings: listingRows.filter((listing) =>
      listingExposesUser(listing, userId, options),
    ),
    buyOrders,
  };
}

function sameIds(
  left: Array<{ id: number }>,
  right: Array<{ id: number }>,
): boolean {
  return (
    left.length === right.length &&
    left.every((row, index) => row.id === right[index]?.id)
  );
}

/**
 * Canonical trade-exposure lock protocol:
 *
 * 1. Discover the complete exposure without row locks.
 * 2. Lock every participant user in stable ID order.
 * 3. Re-probe, then lock buy orders and the union of listings in ID order.
 * 4. Abort when the exposure expanded beyond the locked participant set or
 *    changed before the asset locks completed.
 *
 * Cancellation/refund/delete callers intentionally ignore the returned
 * suspension statuses. These are escape paths, not new trade actions.
 */
export async function lockActiveTradeExposure(
  tx: DbExecutor,
  userId: string,
  now: Date,
  options: TradeExposureLockOptions = {},
): Promise<LockedTradeExposure> {
  const initial = await probeActiveTradeExposure(tx, userId, options);
  const participantUserIds = orderedParticipantIds(
    userId,
    initial.listings,
    options,
  );
  await lockTradeParticipantStatuses(tx, participantUserIds, now);

  const current = await probeActiveTradeExposure(tx, userId, options);
  const lockedParticipantIds = new Set(participantUserIds);
  if (
    orderedParticipantIds(userId, current.listings, options).some(
      (participantId) => !lockedParticipantIds.has(participantId),
    )
  ) {
    throw new TradeExposureChangedError();
  }

  const buyOrders = await tx
    .select()
    .from(marketplaceBuyOrdersV2)
    .where(
      and(
        eq(marketplaceBuyOrdersV2.buyerId, userId),
        eq(marketplaceBuyOrdersV2.status, "active"),
      ),
    )
    .orderBy(asc(marketplaceBuyOrdersV2.id))
    .for("update");
  const listingRows = await tx
    .select()
    .from(marketplaceListingsV2)
    .where(
      options.includeHistoricalReferences
        ? or(
            eq(marketplaceListingsV2.sellerId, userId),
            eq(marketplaceListingsV2.highestBidderId, userId),
            eq(marketplaceListingsV2.buyerId, userId),
          )
        : and(
            eq(marketplaceListingsV2.status, "active"),
            or(
              eq(marketplaceListingsV2.sellerId, userId),
              eq(marketplaceListingsV2.highestBidderId, userId),
            ),
          ),
    )
    .orderBy(asc(marketplaceListingsV2.id))
    .for("update");
  const listings = listingRows.filter((listing) =>
    listingExposesUser(listing, userId, options),
  );

  if (
    !sameIds(current.buyOrders, buyOrders) ||
    !sameIds(current.listings, listings)
  ) {
    throw new TradeExposureChangedError();
  }

  return { participantUserIds, listings, buyOrders };
}

export async function clearActiveTradeExposure(
  tx: DbExecutor,
  userId: string,
  now: Date,
): Promise<TradeExposureCleanupResult> {
  const exposure = await lockActiveTradeExposure(tx, userId, now);
  const result: TradeExposureCleanupResult = {
    listingsCancelled: 0,
    buyOrdersCancelled: 0,
    highestBidsCleared: 0,
    refundedGold: 0,
    economyEvents: [],
  };

  for (const listing of exposure.listings.filter(
    (row) => row.sellerId === userId,
  )) {
    const bidderId = unresolvedMarketplaceHighestBidderId(listing);
    const cancelled = await cancelMarketplaceListingEscrow(tx, listing, {
      now,
      refundHighestBid: true,
      reason: "trade_suspension",
    });
    if (cancelled.cancelled) {
      result.listingsCancelled += 1;
      result.economyEvents.push({
        userId,
        eventType: "marketplace.trade_cleanup.listing_return",
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        detail: { listingId: listing.id },
      });
    }
    if (bidderId && cancelled.refundedBidGold > 0) {
      result.economyEvents.push({
        userId: bidderId,
        counterpartyUserId: listing.sellerId,
        eventType: "marketplace.trade_cleanup.bid_refund",
        goldDelta: cancelled.refundedBidGold,
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        detail: { listingId: listing.id },
      });
    }
    result.refundedGold += cancelled.refundedBidGold;
  }

  for (const order of exposure.buyOrders) {
    const cancelled = await cancelMarketplaceBuyOrderEscrow(
      tx,
      order,
      now,
      "trade_suspension",
    );
    if (cancelled.cancelled) result.buyOrdersCancelled += 1;
    if (cancelled.refundedGold > 0) {
      result.economyEvents.push({
        userId,
        eventType: "marketplace.trade_cleanup.buy_order_refund",
        goldDelta: cancelled.refundedGold,
        itemKind: order.kind,
        itemId: order.itemId,
        quantity: order.quantityRemaining,
        detail: { orderId: order.id },
      });
    }
    result.refundedGold += cancelled.refundedGold;
  }

  for (const listing of exposure.listings.filter(
    (row) =>
      row.sellerId !== userId &&
      row.highestBidderId === userId,
  )) {
    const cleared = await clearMarketplaceHighestBid(
      tx,
      listing,
      now,
      "trade_suspension",
    );
    if (cleared.cleared) result.highestBidsCleared += 1;
    if (cleared.refundedGold > 0) {
      result.economyEvents.push({
        userId,
        counterpartyUserId: listing.sellerId,
        eventType: "marketplace.trade_cleanup.bid_refund",
        goldDelta: cleared.refundedGold,
        itemKind: listing.kind,
        itemId: listing.itemId,
        quantity: listing.quantity,
        detail: { listingId: listing.id },
      });
    }
    result.refundedGold += cleared.refundedGold;
  }

  return result;
}
