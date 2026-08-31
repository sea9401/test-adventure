import { and, eq, isNull, lte, or } from "drizzle-orm";
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
  marketplaceTaxRateForAdventureSupport,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { deliverMarketplaceListing } from "@/lib/server/marketplaceV2Fulfillment";
import { adventureSupportTier } from "@/adventure/data/v2/adventureSupport";
import {
  matchMarketplaceBuyOrder,
  recordMarketplaceAutoMatchFills,
  triggerMarketplacePriceAlertsForListing,
} from "@/lib/server/marketplaceBuyOrdersV2";
import { lockTradeParticipantStatuses } from "@/lib/server/tradeSuspension";
import {
  cancelMarketplaceBuyOrderEscrow,
  cancelMarketplaceListingEscrow,
  clearMarketplaceHighestBid,
  unresolvedMarketplaceHighestBidderId,
} from "@/lib/server/marketplaceEscrow";

type CharSave = {
  adventureSupport?: unknown;
  [key: string]: unknown;
};

const BATCH = 200;

// 공개 입찰 유예 종료와 고정가 등록 만료를 함께 정산한다. cron은 5분마다 호출하며,
// 참여자 user 행을 먼저 잠근 뒤 per-listing FOR UPDATE로 buy/bid/cancel과 직렬화해
// 중복 지급·환불을 막는다.
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
        or(
          and(
            isNull(marketplaceListingsV2.bidResolvedAt),
            lte(marketplaceListingsV2.bidEndsAt, now),
          ),
          lte(marketplaceListingsV2.expiresAt, now),
        ),
      ),
    )
    .limit(BATCH);

  let auctionsSold = 0;
  let bidsRefunded = 0;
  let expired = 0;
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
      if (!listing || listing.status !== "active") return { action: "skip" as const };
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

      if (listing.bidEndsAt <= now && !listing.bidResolvedAt) {
        if (
          listing.highestBidderId &&
          (listing.highestBid ?? 0) > listing.price
        ) {
          const deliveryError = await deliverMarketplaceListing(
            tx,
            listing.highestBidderId,
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
          const gross = listing.highestBid!;
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
              buyerId: listing.highestBidderId,
              price: gross,
              bidResolvedAt: now,
              closedAt: now,
            })
            .where(eq(marketplaceListingsV2.id, id));
          return {
            action: "auction_sold" as const,
            sellerId: listing.sellerId,
            buyerId: listing.highestBidderId,
            itemKind: listing.kind,
            itemId: listing.itemId,
            quantity: listing.quantity,
            gross,
            proceeds,
            taxRate,
          };
        }

        const clearedBid = await clearMarketplaceHighestBid(
          tx,
          listing,
          now,
          "expired",
        );
        if (listing.expiresAt > now) {
          await triggerMarketplacePriceAlertsForListing(tx, id, now);
          return {
            action: clearedBid.cleared
              ? ("bid_refunded" as const)
              : ("resolved" as const),
          };
        }
      }

      if (listing.expiresAt > now) return { action: "skip" as const };
      await cancelMarketplaceListingEscrow(tx, listing, {
        now,
        refundHighestBid: true,
        reason: "expired",
      });
      return { action: "expired" as const };
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
    } else if (result.action === "bid_refunded") {
      bidsRefunded++;
    } else if (result.action === "expired") {
      expired++;
    } else if (result.action === "restricted_cancelled") {
      restrictedCancelled++;
      if (result.refundedGold > 0) bidsRefunded++;
    }
  }

  const dueOrders = await db
    .select({ id: marketplaceBuyOrdersV2.id })
    .from(marketplaceBuyOrdersV2)
    .where(
      and(
        eq(marketplaceBuyOrdersV2.status, "active"),
        lte(marketplaceBuyOrdersV2.expiresAt, now),
      ),
    )
    .limit(BATCH);
  let ordersExpired = 0;
  for (const { id } of dueOrders) {
    const result = await db.transaction(async (tx) => {
      const [probe] = await tx
        .select({ buyerId: marketplaceBuyOrdersV2.buyerId })
        .from(marketplaceBuyOrdersV2)
        .where(eq(marketplaceBuyOrdersV2.id, id))
        .limit(1);
      if (!probe) return null;
      // Expiry/refund is allowed for suspended buyers. Locking the user first
      // only keeps this path compatible with the shared cleanup protocol.
      await lockTradeParticipantStatuses(tx, [probe.buyerId], now);
      const [order] = await tx
        .select()
        .from(marketplaceBuyOrdersV2)
        .where(eq(marketplaceBuyOrdersV2.id, id))
        .for("update");
      if (
        !order ||
        order.buyerId !== probe.buyerId ||
        order.status !== "active" ||
        order.expiresAt > now
      ) {
        return null;
      }
      const cancellation = await cancelMarketplaceBuyOrderEscrow(
        tx,
        order,
        now,
        "expired",
      );
      return { buyerId: order.buyerId, refund: cancellation.refundedGold };
    });
    if (result) {
      ordersExpired++;
      if (result.refund > 0) {
        recordEconomyEventSoon({
          userId: result.buyerId,
          eventType: "marketplace.buy_order.refund",
          goldDelta: result.refund,
          detail: { orderId: id, reason: "expired" },
        });
      }
    }
  }

  const activeOrders = await db
    .select({ id: marketplaceBuyOrdersV2.id })
    .from(marketplaceBuyOrdersV2)
    .where(eq(marketplaceBuyOrdersV2.status, "active"))
    .limit(BATCH);
  let ordersMatched = 0;
  for (const { id } of activeOrders) {
    const fills = await db.transaction((tx) =>
      matchMarketplaceBuyOrder(tx, id, now),
    );
    if (fills.length > 0) {
      ordersMatched += fills.length;
      recordMarketplaceAutoMatchFills(fills);
    }
  }

  return Response.json({
    ok: true,
    scanned: due.length,
    auctionsSold,
    bidsRefunded,
    expired,
    restrictedCancelled,
    ordersExpired,
    ordersMatched,
  });
}
