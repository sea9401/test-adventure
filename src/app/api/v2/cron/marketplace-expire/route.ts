import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import { type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { parseRareMaps } from "@/adventure/data/v2/rareMaps";
import { requireCronAuth } from "@/lib/server/cronAuth";
import { inboxValues } from "@/lib/server/inboxPayload";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  marketplaceTaxRateForAdventureSupport,
  restoreMarketplaceRareMap,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import {
  deliverFishSpecimenStack,
  deliverMarketplaceListing,
} from "@/lib/server/marketplaceV2Fulfillment";
import { adventureSupportActive } from "@/adventure/data/v2/adventureSupport";
import {
  addMuseunCashItem,
  isMuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  addCookingFood,
  isCookingFoodId,
} from "@/adventure/v2/cooking";
import {
  matchMarketplaceBuyOrder,
  recordMarketplaceAutoMatchFills,
  triggerMarketplacePriceAlertsForListing,
} from "@/lib/server/marketplaceBuyOrdersV2";

type CharSave = {
  materials?: Record<string, number>;
  rareMaps?: unknown;
  cashItems?: unknown;
  adventureSupport?: unknown;
  [key: string]: unknown;
};
type InventorySave = Record<string, unknown> & { cookingFoods?: unknown };

const BATCH = 200;

// 공개 입찰 유예 종료와 고정가 등록 만료를 함께 정산한다. cron은 5분마다 호출하며,
// per-listing FOR UPDATE로 buy/bid/cancel과 직렬화해 중복 지급·환불을 막는다.
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
  for (const { id } of due) {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(marketplaceListingsV2)
        .where(eq(marketplaceListingsV2.id, id))
        .for("update");
      if (!listing || listing.status !== "active") return { action: "skip" as const };

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
            adventureSupportActive(sellerCharacter.adventureSupport),
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

        if (listing.highestBidderId && (listing.highestBid ?? 0) > 0) {
          await tx.insert(marketplaceInbox).values(
            inboxValues({
              userId: listing.highestBidderId,
              payload: { kind: "bid_refund", gold: listing.highestBid! },
              message: `${listing.itemName} 유예 종료 · ${listing.highestBid!.toLocaleString()}골드 반환`,
            }),
          );
        }
        await tx
          .update(marketplaceListingsV2)
          .set({ bidResolvedAt: now })
          .where(eq(marketplaceListingsV2.id, id));
        if (listing.expiresAt > now) {
          await triggerMarketplacePriceAlertsForListing(tx, id, now);
          return {
            action: listing.highestBidderId
              ? ("bid_refunded" as const)
              : ("resolved" as const),
          };
        }
      }

      if (listing.expiresAt > now) return { action: "skip" as const };
      await returnListing(tx, listing);
      await tx
        .update(marketplaceListingsV2)
        .set({ status: "expired", closedAt: now })
        .where(eq(marketplaceListingsV2.id, id));
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
      const [order] = await tx
        .select()
        .from(marketplaceBuyOrdersV2)
        .where(eq(marketplaceBuyOrdersV2.id, id))
        .for("update");
      if (!order || order.status !== "active" || order.expiresAt > now) {
        return null;
      }
      if (order.goldEscrow > 0) {
        await tx.insert(marketplaceInbox).values(
          inboxValues({
            userId: order.buyerId,
            payload: { kind: "buy_order_refund", gold: order.goldEscrow },
            message: `${order.itemName} 구매 주문 만료 · ${order.goldEscrow.toLocaleString()}골드 반환`,
          }),
        );
      }
      await tx
        .update(marketplaceBuyOrdersV2)
        .set({ status: "expired", goldEscrow: 0, closedAt: now })
        .where(eq(marketplaceBuyOrdersV2.id, order.id));
      return { buyerId: order.buyerId, refund: order.goldEscrow };
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
    ordersExpired,
    ordersMatched,
  });
}

async function returnListing(
  tx: Parameters<typeof deliverMarketplaceListing>[0],
  listing: Parameters<typeof deliverMarketplaceListing>[2],
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
      // 표본 스택 반환 완료.
    } else if (isMuseunCashItemId(listing.itemId)) {
      await upsertSave(tx, listing.sellerId, "character.v2", {
        ...charSave,
        cashItems: addMuseunCashItem(
          charSave.cashItems,
          listing.itemId,
          listing.quantity,
        ),
      });
    } else if (isCookingFoodId(listing.itemId)) {
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
    } else {
      const restored = restoreMarketplaceRareMap(
        listing.instancePayload,
        Date.now(),
        { preserveIid: true },
      );
      if (restored) {
        await upsertSave(tx, listing.sellerId, "character.v2", {
          ...charSave,
          rareMaps: [...parseRareMaps(charSave.rareMaps, Date.now()), restored],
        });
      }
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
