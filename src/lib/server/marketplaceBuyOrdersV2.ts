import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
  marketplacePriceAlertsV2,
} from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import { readSave } from "@/lib/server/savesKv";
import { inboxValues } from "@/lib/server/inboxPayload";
import {
  marketplacePartialPrice,
  marketplaceTaxRateForAdventureSupport,
  marketplaceUnitPrice,
  saleProceeds,
} from "@/lib/server/marketplaceV2";
import { adventureSupportActive } from "@/adventure/data/v2/adventureSupport";
import { isTradeableMuseunCashItemId } from "@/adventure/data/v2/museunCashItems";
import { isCookingFoodId } from "@/adventure/v2/cooking";
import { fishIdFromSpecimenItemId } from "@/adventure/v2/fishSpecimens";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";

type CharSave = { adventureSupport?: unknown; [key: string]: unknown };

export type MarketplaceAutoMatchFill = {
  orderId: number;
  listingId: number;
  buyerId: string;
  sellerId: string;
  itemKind: string;
  itemId: string;
  quantity: number;
  gross: number;
  proceeds: number;
  taxRate: number;
};

export function recordMarketplaceAutoMatchFills(
  fills: MarketplaceAutoMatchFill[],
) {
  for (const fill of fills) {
    recordEconomyEventSoon({
      userId: fill.buyerId,
      counterpartyUserId: fill.sellerId,
      eventType: "marketplace.buy_order.fill",
      goldDelta: 0,
      itemKind: fill.itemKind,
      itemId: fill.itemId,
      quantity: fill.quantity,
      detail: {
        orderId: fill.orderId,
        listingId: fill.listingId,
        escrowGoldUsed: fill.gross,
      },
    });
    recordEconomyEventSoon({
      userId: fill.sellerId,
      counterpartyUserId: fill.buyerId,
      eventType: "marketplace.buy_order.sell",
      goldDelta: fill.proceeds,
      itemKind: fill.itemKind,
      itemId: fill.itemId,
      quantity: fill.quantity,
      detail: {
        orderId: fill.orderId,
        listingId: fill.listingId,
        grossGold: fill.gross,
        taxRate: fill.taxRate,
      },
    });
  }
}

export function marketplaceBuyOrderDeliveryKind(
  kind: string,
  itemId: string,
): "material" | "cash" | "cooking" | "specimen" | null {
  if (kind === "material") return "material";
  if (kind !== "consumable") return null;
  if (isTradeableMuseunCashItemId(itemId)) return "cash";
  if (isCookingFoodId(itemId)) return "cooking";
  if (fishIdFromSpecimenItemId(itemId)) return "specimen";
  return null;
}

export async function matchMarketplaceBuyOrder(
  tx: DbExecutor,
  orderId: number,
  now = new Date(),
): Promise<MarketplaceAutoMatchFill[]> {
  const [order] = await tx
    .select()
    .from(marketplaceBuyOrdersV2)
    .where(eq(marketplaceBuyOrdersV2.id, orderId))
    .for("update");
  if (
    !order ||
    order.status !== "active" ||
    order.quantityRemaining <= 0 ||
    order.expiresAt <= now
  ) {
    return [];
  }
  const itemKind = marketplaceBuyOrderDeliveryKind(order.kind, order.itemId);
  if (!itemKind) return [];

  const listings = await tx
    .select()
    .from(marketplaceListingsV2)
    .where(
      and(
        eq(marketplaceListingsV2.status, "active"),
        eq(marketplaceListingsV2.kind, order.kind),
        eq(marketplaceListingsV2.itemId, order.itemId),
        ne(marketplaceListingsV2.sellerId, order.buyerId),
        lte(marketplaceListingsV2.bidEndsAt, now),
        gt(marketplaceListingsV2.expiresAt, now),
        lte(
          sql`ceil(${marketplaceListingsV2.price}::numeric / greatest(${marketplaceListingsV2.quantity}, 1))`,
          order.unitPrice,
        ),
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
    .limit(100)
    .for("update");

  let remaining = order.quantityRemaining;
  let escrow = order.goldEscrow;
  const fills: MarketplaceAutoMatchFill[] = [];
  const sellerTaxRates = new Map<string, number>();

  for (const listing of listings) {
    if (remaining <= 0) break;
    let take = Math.min(remaining, listing.quantity);
    let gross = marketplacePartialPrice(listing.price, listing.quantity, take);
    if (gross == null) {
      if (remaining < listing.quantity) continue;
      take = listing.quantity;
      gross = listing.price;
    }
    if (gross > escrow) break;

    let taxRate = sellerTaxRates.get(listing.sellerId);
    if (taxRate == null) {
      const sellerCharacter = await readSave<CharSave>(
        tx,
        listing.sellerId,
        "character.v2",
        {},
      );
      taxRate = marketplaceTaxRateForAdventureSupport(
        adventureSupportActive(sellerCharacter.adventureSupport),
      );
      sellerTaxRates.set(listing.sellerId, taxRate);
    }
    const proceeds = saleProceeds(gross, taxRate);

    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: order.buyerId,
        payload: {
          kind: "buy_order_item",
          item_kind: itemKind,
          item_id: order.itemId,
          quantity: take,
        },
        message: `${order.itemName} 구매 주문 ${take.toLocaleString()}개 체결`,
      }),
    );
    if (proceeds > 0) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: listing.sellerId,
          payload: { kind: "sale_proceeds", gold: proceeds },
          message: `${listing.itemName} ${take.toLocaleString()}개 자동 판매 대금 ${proceeds.toLocaleString()}골드`,
        }),
      );
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
    }

    await tx
      .update(marketplaceListingsV2)
      .set({
        status: "sold",
        quantity: take,
        price: gross,
        buyerId: order.buyerId,
        bidResolvedAt: now,
        closedAt: now,
      })
      .where(eq(marketplaceListingsV2.id, listing.id));

    const remainderQuantity = listing.quantity - take;
    if (remainderQuantity > 0) {
      await tx.insert(marketplaceListingsV2).values({
        sellerId: listing.sellerId,
        sellerName: listing.sellerName,
        kind: listing.kind,
        itemId: listing.itemId,
        itemName: listing.itemName,
        quantity: remainderQuantity,
        price: listing.price - gross,
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

    remaining -= take;
    escrow -= gross;
    fills.push({
      orderId: order.id,
      listingId: listing.id,
      buyerId: order.buyerId,
      sellerId: listing.sellerId,
      itemKind: listing.kind,
      itemId: listing.itemId,
      quantity: take,
      gross,
      proceeds,
      taxRate,
    });
  }

  const filled = remaining <= 0;
  if (filled && escrow > 0) {
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: order.buyerId,
        payload: { kind: "buy_order_refund", gold: escrow },
        message: `${order.itemName} 구매 주문 잔여금 ${escrow.toLocaleString()}골드 반환`,
      }),
    );
  }
  await tx
    .update(marketplaceBuyOrdersV2)
    .set({
      quantityRemaining: remaining,
      goldEscrow: filled ? 0 : escrow,
      status: filled ? "filled" : "active",
      closedAt: filled ? now : null,
    })
    .where(eq(marketplaceBuyOrdersV2.id, order.id));
  return fills;
}

export async function matchMarketplaceBuyOrdersForItem(
  tx: DbExecutor,
  kind: string,
  itemId: string,
  now = new Date(),
): Promise<MarketplaceAutoMatchFill[]> {
  const orders = await tx
    .select({ id: marketplaceBuyOrdersV2.id })
    .from(marketplaceBuyOrdersV2)
    .where(
      and(
        eq(marketplaceBuyOrdersV2.status, "active"),
        eq(marketplaceBuyOrdersV2.kind, kind),
        eq(marketplaceBuyOrdersV2.itemId, itemId),
        gt(marketplaceBuyOrdersV2.expiresAt, now),
      ),
    )
    .orderBy(
      desc(marketplaceBuyOrdersV2.unitPrice),
      asc(marketplaceBuyOrdersV2.createdAt),
    )
    .limit(50);
  const fills: MarketplaceAutoMatchFill[] = [];
  for (const order of orders) {
    fills.push(...(await matchMarketplaceBuyOrder(tx, order.id, now)));
  }
  return fills;
}

export async function triggerMarketplacePriceAlertsForListing(
  tx: DbExecutor,
  listingId: number,
  now = new Date(),
): Promise<number> {
  const [listing] = await tx
    .select()
    .from(marketplaceListingsV2)
    .where(eq(marketplaceListingsV2.id, listingId))
    .limit(1);
  if (
    !listing ||
    listing.status !== "active" ||
    listing.bidEndsAt > now ||
    listing.expiresAt <= now
  ) {
    return 0;
  }
  const unitPrice = marketplaceUnitPrice(listing.price, listing.quantity);
  const alerts = await tx
    .select()
    .from(marketplacePriceAlertsV2)
    .where(
      and(
        eq(marketplacePriceAlertsV2.status, "active"),
        eq(marketplacePriceAlertsV2.kind, listing.kind),
        eq(marketplacePriceAlertsV2.itemId, listing.itemId),
        ne(marketplacePriceAlertsV2.userId, listing.sellerId),
        gte(marketplacePriceAlertsV2.targetUnitPrice, unitPrice),
      ),
    )
    .for("update");
  for (const alert of alerts) {
    const text = `${listing.itemName} 매물이 개당 ${unitPrice.toLocaleString()}골드에 등록됐어요.`;
    await tx.insert(marketplaceInbox).values(
      inboxValues({
        userId: alert.userId,
        payload: { kind: "price_alert", text },
        message: text,
      }),
    );
    await tx
      .update(marketplacePriceAlertsV2)
      .set({ status: "triggered", triggeredAt: now })
      .where(eq(marketplacePriceAlertsV2.id, alert.id));
  }
  return alerts.length;
}
