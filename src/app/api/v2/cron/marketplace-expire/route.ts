import { and, eq, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";
import { readSave } from "@/lib/server/savesKv";
import { requireCronAuth } from "@/lib/server/cronAuth";
import { inboxValues } from "@/lib/server/inboxPayload";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  MARKETPLACE_V2_AUCTION_MODE_VERSION,
  marketplaceTaxRateForAdventureSupport,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { deliverMarketplaceListing } from "@/lib/server/marketplaceV2Fulfillment";
import { adventureSupportTier } from "@/adventure/data/v2/adventureSupport";
import { lockTradeParticipantStatuses } from "@/lib/server/tradeSuspension";
import {
  cancelMarketplaceBuyOrderEscrow,
  cancelMarketplaceListingEscrow,
  unresolvedMarketplaceHighestBidderId,
} from "@/lib/server/marketplaceEscrow";

type CharSave = {
  adventureSupport?: unknown;
  [key: string]: unknown;
};

const BATCH = 200;

// 5분마다 종료된 현행 경매를 정산하고, 전환 전에 등록된 매물·구매 주문은
// 만료 시각과 관계없이 bounded batch로 원소유자에게 반환한다.
export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const due = await db
    .select({ id: marketplaceListingsV2.id })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "active"),
        eq(
          marketplaceListingsV2.auctionModeVersion,
          MARKETPLACE_V2_AUCTION_MODE_VERSION,
        ),
        lte(marketplaceListingsV2.bidEndsAt, now),
      ),
    )
    .limit(BATCH);

  let auctionsSold = 0;
  let auctionsReturned = 0;
  let bidsRefunded = 0;
  let restrictedCancelled = 0;
  for (const { id } of due) {
    const result = await db.transaction(async (tx) => {
      const [probe] = await tx
        .select({
          sellerId: marketplaceListingsV2.sellerId,
          highestBidderId: marketplaceListingsV2.highestBidderId,
          highestBid: marketplaceListingsV2.highestBid,
          bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
        })
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .limit(1);
      if (!probe) return { action: "skip" as const };
      const probeBidderId = unresolvedMarketplaceHighestBidderId(probe);
      const participantIds = [
        probe.sellerId,
        ...(probeBidderId ? [probeBidderId] : []),
      ];
      const participantStatuses = await lockTradeParticipantStatuses(
        tx,
        participantIds,
        now,
      );
      const [listing] = await tx
        .select()
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .for("update");
      if (
        !listing ||
        listing.status !== "active" ||
        listing.auctionModeVersion !== MARKETPLACE_V2_AUCTION_MODE_VERSION ||
        listing.bidEndsAt > now
      ) {
        return { action: "skip" as const };
      }
      const bidderId = unresolvedMarketplaceHighestBidderId(listing);
      if (
        listing.sellerId !== probe.sellerId ||
        (bidderId != null && !participantIds.includes(bidderId))
      ) {
        return { action: "skip" as const };
      }
      if (
        participantStatuses.get(listing.sellerId) ||
        (bidderId && participantStatuses.get(bidderId))
      ) {
        const cancellation = await cancelMarketplaceListingEscrow(tx, listing, {
          now,
          refundHighestBid: true,
          reason: "trade_suspension",
        });
        return {
          action: "restricted_cancelled" as const,
          refundedGold: cancellation.refundedBidGold,
        };
      }

      const gross = listing.highestBid ?? 0;
      if (bidderId && gross >= listing.price) {
        const deliveryError = await deliverMarketplaceListing(
          tx,
          bidderId,
          listing,
          { enforceRareMapCap: false },
        );
        if (deliveryError) return { action: "skip" as const };

        const sellerCharacter = await readSave<CharSave>(
          tx,
          listing.sellerId,
          "character.v2",
          {},
        );
        const taxRate = marketplaceTaxRateForAdventureSupport(
          adventureSupportTier(sellerCharacter.adventureSupport),
        );
        const proceeds = saleProceeds(gross, taxRate);
        if (proceeds > 0) {
          await tx.insert(marketplaceInbox).values(
            inboxValues({
              userId: listing.sellerId,
              payload: { kind: "sale_proceeds", gold: proceeds },
              message: `${listing.itemName} 입찰 판매 대금 ${proceeds.toLocaleString()}골드`,
            }),
          );
        }
        await tx
          .update(marketplaceListingsV2)
          .set({
            status: "sold",
            buyerId: bidderId,
            price: gross,
            bidResolvedAt: now,
            closedAt: now,
          })
          .where(eq(marketplaceListingsV2.id, id));
        return {
          action: "auction_sold" as const,
          sellerId: listing.sellerId,
          buyerId: bidderId,
          itemKind: listing.kind,
          itemId: listing.itemId,
          quantity: listing.quantity,
          gross,
          proceeds,
          taxRate,
        };
      }

      const cancellation = await cancelMarketplaceListingEscrow(tx, listing, {
        now,
        refundHighestBid: true,
        reason: "expired",
      });
      return {
        action: "auction_returned" as const,
        refundedGold: cancellation.refundedBidGold,
      };
    });

    if (result.action === "auction_sold") {
      auctionsSold++;
      recordEconomyEventSoon({
        userId: result.sellerId,
        counterpartyUserId: result.buyerId,
        eventType: "marketplace.auction.sell",
        goldDelta: result.proceeds,
        itemKind: result.itemKind,
        itemId: result.itemId,
        quantity: result.quantity,
        detail: { listingId: id, grossGold: result.gross, taxRate: result.taxRate },
      });
    } else if (result.action === "auction_returned") {
      auctionsReturned++;
      if (result.refundedGold > 0) bidsRefunded++;
    } else if (result.action === "restricted_cancelled") {
      restrictedCancelled++;
      if (result.refundedGold > 0) bidsRefunded++;
    }
  }

  const legacyListings = await db
    .select({ id: marketplaceListingsV2.id })
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "active"),
        ne(
          marketplaceListingsV2.auctionModeVersion,
          MARKETPLACE_V2_AUCTION_MODE_VERSION,
        ),
      ),
    )
    .limit(BATCH);
  let legacyListingsReturned = 0;
  let legacyBidsRefunded = 0;
  for (const { id } of legacyListings) {
    const result = await db.transaction(async (tx) => {
      const [probe] = await tx
        .select({
          sellerId: marketplaceListingsV2.sellerId,
          highestBidderId: marketplaceListingsV2.highestBidderId,
          highestBid: marketplaceListingsV2.highestBid,
          bidResolvedAt: marketplaceListingsV2.bidResolvedAt,
        })
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .limit(1);
      if (!probe) return null;
      const bidderId = unresolvedMarketplaceHighestBidderId(probe);
      await lockTradeParticipantStatuses(
        tx,
        [probe.sellerId, ...(bidderId ? [bidderId] : [])],
        now,
      );
      const [listing] = await tx
        .select()
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .for("update");
      if (
        !listing ||
        listing.sellerId !== probe.sellerId ||
        listing.status !== "active" ||
        listing.auctionModeVersion === MARKETPLACE_V2_AUCTION_MODE_VERSION
      ) {
        return null;
      }
      const cancellation = await cancelMarketplaceListingEscrow(tx, listing, {
        now,
        refundHighestBid: true,
        reason: "feature_retired",
      });
      return {
        sellerId: listing.sellerId,
        refund: cancellation.refundedBidGold,
      };
    });
    if (result) {
      legacyListingsReturned++;
      legacyBidsRefunded += result.refund;
      recordEconomyEventSoon({
        userId: result.sellerId,
        eventType: "marketplace.legacy_listing.return",
        goldDelta: 0,
        detail: { listingId: id, refundedBidGold: result.refund },
      });
    }
  }

  const activeOrders = await db
    .select({ id: marketplaceBuyOrdersV2.id })
    .from(marketplaceBuyOrdersV2)
    .where(eq(marketplaceBuyOrdersV2.status, "active"))
    .limit(BATCH);
  let legacyOrdersReturned = 0;
  let legacyOrdersRefunded = 0;
  for (const { id } of activeOrders) {
    const result = await db.transaction(async (tx) => {
      const [probe] = await tx
        .select({ buyerId: marketplaceBuyOrdersV2.buyerId })
        .from(marketplaceBuyOrdersV2)
        .where(eq(marketplaceBuyOrdersV2.id, id))
        .limit(1);
      if (!probe) return null;
      await lockTradeParticipantStatuses(tx, [probe.buyerId], now);
      const [order] = await tx
        .select()
        .from(marketplaceBuyOrdersV2)
        .where(eq(marketplaceBuyOrdersV2.id, id))
        .for("update");
      if (
        !order ||
        order.buyerId !== probe.buyerId ||
        order.status !== "active"
      ) {
        return null;
      }
      const cancellation = await cancelMarketplaceBuyOrderEscrow(
        tx,
        order,
        now,
        "feature_retired",
      );
      return { buyerId: order.buyerId, refund: cancellation.refundedGold };
    });
    if (result) {
      legacyOrdersReturned++;
      legacyOrdersRefunded += result.refund;
      recordEconomyEventSoon({
        userId: result.buyerId,
        eventType: "marketplace.buy_order.refund",
        goldDelta: result.refund,
        detail: { orderId: id, reason: "feature_retired" },
      });
    }
  }

  return Response.json({
    ok: true,
    scanned: due.length,
    auctionsSold,
    auctionsReturned,
    bidsRefunded,
    expired: auctionsReturned,
    restrictedCancelled,
    legacyListingsReturned,
    legacyBidsRefunded,
    legacyOrdersReturned,
    legacyOrdersRefunded,
    ordersExpired: 0,
    ordersMatched: 0,
  });
}
