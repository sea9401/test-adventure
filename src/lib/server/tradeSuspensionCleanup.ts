import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";
import {
  marketplaceBuyOrdersV2,
  marketplaceListingsV2,
} from "@/db/schema";
import {
  cancelMarketplaceBuyOrderEscrow,
  cancelMarketplaceListingEscrow,
  clearMarketplaceHighestBid,
} from "@/lib/server/marketplaceEscrow";
import type { DbExecutor } from "@/lib/server/savesKv";
import { lockTradeParticipantStatuses } from "@/lib/server/tradeSuspension";

export type TradeExposureCleanupResult = {
  listingsCancelled: number;
  buyOrdersCancelled: number;
  highestBidsCleared: number;
  refundedGold: number;
};

export async function clearActiveTradeExposure(
  tx: DbExecutor,
  userId: string,
  now: Date,
): Promise<TradeExposureCleanupResult> {
  await lockTradeParticipantStatuses(tx, [userId], now);

  const result: TradeExposureCleanupResult = {
    listingsCancelled: 0,
    buyOrdersCancelled: 0,
    highestBidsCleared: 0,
    refundedGold: 0,
  };

  const ownedListings = await tx
    .select()
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.sellerId, userId),
        eq(marketplaceListingsV2.status, "active"),
      ),
    )
    .orderBy(asc(marketplaceListingsV2.id))
    .for("update");
  for (const listing of ownedListings) {
    const cancelled = await cancelMarketplaceListingEscrow(tx, listing, {
      now,
      refundHighestBid: true,
      reason: "trade_suspension",
    });
    if (cancelled.cancelled) result.listingsCancelled += 1;
    result.refundedGold += cancelled.refundedBidGold;
  }

  const ownedBuyOrders = await tx
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
  for (const order of ownedBuyOrders) {
    const cancelled = await cancelMarketplaceBuyOrderEscrow(
      tx,
      order,
      now,
      "trade_suspension",
    );
    if (cancelled.cancelled) result.buyOrdersCancelled += 1;
    result.refundedGold += cancelled.refundedGold;
  }

  const foreignHighestBids = await tx
    .select()
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.highestBidderId, userId),
        ne(marketplaceListingsV2.sellerId, userId),
        eq(marketplaceListingsV2.status, "active"),
      ),
    )
    .orderBy(asc(marketplaceListingsV2.id))
    .for("update");
  for (const listing of foreignHighestBids) {
    const cleared = await clearMarketplaceHighestBid(
      tx,
      listing,
      now,
      "trade_suspension",
    );
    if (cleared.cleared) result.highestBidsCleared += 1;
    result.refundedGold += cleared.refundedGold;
  }

  return result;
}
