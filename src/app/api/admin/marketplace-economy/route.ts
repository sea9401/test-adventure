import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  abuseEvents,
  economyEvents,
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import { marketplaceEquipmentTradeRisk } from "@/lib/server/marketplaceTradeRisk";

const SELL_EVENT_TYPES = [
  "marketplace.sell",
  "marketplace.buy_order.sell",
  "marketplace.equipment_buy_order.sell",
] as const;

type Sale = {
  id: number;
  sellerId: string | null;
  buyerId: string | null;
  itemKind: string | null;
  itemId: string | null;
  quantity: number;
  grossGold: number;
  proceedsGold: number;
  taxGold: number;
  createdAt: Date;
  orderId: number | null;
  minimumPrice: number | null;
  power: number | null;
  qualityPct: number | null;
};

function finiteInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function saleFromEvent(row: {
  id: number;
  userId: string | null;
  counterpartyUserId: string | null;
  goldDelta: number;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
    detail: unknown;
  createdAt: Date;
}): Sale | null {
  const detail =
    row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
      ? (row.detail as Record<string, unknown>)
      : {};
  const grossGold = finiteInteger(detail.grossGold);
  if (grossGold == null || grossGold <= 0) return null;
  const proceedsGold = Math.max(0, row.goldDelta);
  return {
    id: row.id,
    sellerId: row.userId,
    buyerId: row.counterpartyUserId,
    itemKind: row.itemKind,
    itemId: row.itemId,
    quantity: Math.max(1, Math.floor(row.quantity ?? 1)),
    grossGold,
    proceedsGold,
    taxGold: Math.max(0, grossGold - proceedsGold),
    createdAt: row.createdAt,
    orderId: finiteInteger(detail.orderId),
    minimumPrice: finiteInteger(detail.minimumPrice),
    power: finiteInteger(detail.power),
    qualityPct: finiteInteger(detail.qualityPct),
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [
    eventRows,
    activeListings,
    activeOrders,
    equipmentAuditRows,
    equipmentInboxRows,
  ] =
    await Promise.all([
      db
      .select({
        id: economyEvents.id,
        userId: economyEvents.userId,
        counterpartyUserId: economyEvents.counterpartyUserId,
        goldDelta: economyEvents.goldDelta,
        itemKind: economyEvents.itemKind,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        detail: economyEvents.detail,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(
        and(
          inArray(economyEvents.eventType, [...SELL_EVENT_TYPES]),
          gte(economyEvents.createdAt, since),
        ),
      )
      .orderBy(desc(economyEvents.id))
      .limit(10_000),
      db
      .select({
        itemId: marketplaceListingsV2.itemId,
        itemName: marketplaceListingsV2.itemName,
        quantity: marketplaceListingsV2.quantity,
        expiresAt: marketplaceListingsV2.expiresAt,
      })
      .from(marketplaceListingsV2)
      .where(eq(marketplaceListingsV2.status, "active"))
      .limit(5_000),
    db
      .select({
        itemId: marketplaceBuyOrdersV2.itemId,
        itemName: marketplaceBuyOrdersV2.itemName,
        quantityRemaining: marketplaceBuyOrdersV2.quantityRemaining,
        goldEscrow: marketplaceBuyOrdersV2.goldEscrow,
        expiresAt: marketplaceBuyOrdersV2.expiresAt,
      })
      .from(marketplaceBuyOrdersV2)
      .where(eq(marketplaceBuyOrdersV2.status, "active"))
        .limit(5_000),
      db
        .select({
          userId: abuseEvents.userId,
          ip: abuseEvents.ip,
          action: abuseEvents.action,
          detail: abuseEvents.detail,
          createdAt: abuseEvents.createdAt,
        })
        .from(abuseEvents)
        .where(
          and(
            inArray(abuseEvents.action, [
              "marketplace.equipment_buy_order.create",
              "marketplace.equipment_buy_order.fill",
            ]),
            gte(abuseEvents.createdAt, since),
          ),
        )
        .orderBy(desc(abuseEvents.id))
        .limit(5_000),
      db
        .select({
          payload: marketplaceInbox.payload,
          createdAt: marketplaceInbox.createdAt,
          claimedAt: marketplaceInbox.claimedAt,
        })
        .from(marketplaceInbox)
        .where(
          and(
            eq(marketplaceInbox.kind, "buy_order_equipment"),
            gte(marketplaceInbox.createdAt, since),
          ),
        )
        .orderBy(desc(marketplaceInbox.id))
        .limit(5_000),
    ]);
  const sales = eventRows.map(saleFromEvent).filter((row): row is Sale => row != null);

  const daily = new Map<
    string,
    { date: string; trades: number; volume: number; grossGold: number; taxGold: number }
  >();
  const items = new Map<
    string,
    {
      itemId: string;
      trades: number;
      volume: number;
      grossGold: number;
      currentTrades: number;
      currentGold: number;
      baselineTrades: number;
      baselineGold: number;
    }
  >();
  const pairs = new Map<
    string,
    { sellerId: string; buyerId: string; trades: number; grossGold: number }
  >();
  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const eightDaysAgo = now.getTime() - 8 * 24 * 60 * 60 * 1000;

  for (const sale of sales) {
    const date = sale.createdAt.toISOString().slice(0, 10);
    const day = daily.get(date) ?? { date, trades: 0, volume: 0, grossGold: 0, taxGold: 0 };
    day.trades++;
    day.volume += sale.quantity;
    day.grossGold += sale.grossGold;
    day.taxGold += sale.taxGold;
    daily.set(date, day);

    if (sale.itemId) {
      const item = items.get(sale.itemId) ?? {
        itemId: sale.itemId,
        trades: 0,
        volume: 0,
        grossGold: 0,
        currentTrades: 0,
        currentGold: 0,
        baselineTrades: 0,
        baselineGold: 0,
      };
      item.trades++;
      item.volume += sale.quantity;
      item.grossGold += sale.grossGold;
      const time = sale.createdAt.getTime();
      if (time >= oneDayAgo) {
        item.currentTrades++;
        item.currentGold += sale.grossGold / sale.quantity;
      } else if (time >= eightDaysAgo) {
        item.baselineTrades++;
        item.baselineGold += sale.grossGold / sale.quantity;
      }
      items.set(sale.itemId, item);
    }

    if (sale.sellerId && sale.buyerId) {
      const key = `${sale.sellerId}:${sale.buyerId}`;
      const pair = pairs.get(key) ?? {
        sellerId: sale.sellerId,
        buyerId: sale.buyerId,
        trades: 0,
        grossGold: 0,
      };
      pair.trades++;
      pair.grossGold += sale.grossGold;
      pairs.set(key, pair);
    }
  }

  const summary = sales.reduce(
    (acc, sale) => ({
      trades: acc.trades + 1,
      volume: acc.volume + sale.quantity,
      grossGold: acc.grossGold + sale.grossGold,
      taxGold: acc.taxGold + sale.taxGold,
    }),
    { trades: 0, volume: 0, grossGold: 0, taxGold: 0 },
  );
  const popularItems = [...items.values()]
    .sort((a, b) => b.grossGold - a.grossGold || b.volume - a.volume)
    .slice(0, 12)
    .map((item) => ({
      itemId: item.itemId,
      trades: item.trades,
      volume: item.volume,
      grossGold: item.grossGold,
    }));
  const priceMovements = [...items.values()]
    .filter((item) => item.currentTrades >= 2 && item.baselineTrades >= 2)
    .map((item) => {
      const currentUnitPrice = Math.round(item.currentGold / item.currentTrades);
      const baselineUnitPrice = Math.round(item.baselineGold / item.baselineTrades);
      return {
        itemId: item.itemId,
        currentUnitPrice,
        baselineUnitPrice,
        changePct: Math.round(((currentUnitPrice - baselineUnitPrice) / baselineUnitPrice) * 100),
      };
    })
    .filter((item) => Math.abs(item.changePct) >= 50)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 12);

  const repeatedPairSignals = [...pairs.values()]
    .filter((pair) => pair.sellerId === pair.buyerId || pair.trades >= 5)
    .map((pair) => ({
      kind: pair.sellerId === pair.buyerId ? "self_trade" : "repeated_pair",
      severity: pair.sellerId === pair.buyerId ? "danger" : "warning",
      ...pair,
    }))
    .sort((a, b) => b.trades - a.trades || b.grossGold - a.grossGold);
  const abnormalPriceSignals = sales
    .filter((sale) => {
      if (!sale.itemId) return false;
      const item = items.get(sale.itemId);
      if (!item || item.trades < 5 || item.volume <= 0) return false;
      const baselineVolume = item.volume - sale.quantity;
      const baselineGold = item.grossGold - sale.grossGold;
      if (baselineVolume <= 0 || baselineGold <= 0) return false;
      const averageUnitPrice = baselineGold / baselineVolume;
      const unitPrice = sale.grossGold / sale.quantity;
      return unitPrice >= averageUnitPrice * 5 || unitPrice <= averageUnitPrice * 0.2;
    })
    .map((sale) => ({
      kind: "abnormal_price" as const,
      severity: "warning" as const,
      sellerId: sale.sellerId ?? "unknown",
      buyerId: sale.buyerId ?? "unknown",
      trades: 1,
      grossGold: sale.grossGold,
      itemId: sale.itemId,
    }));
  const createAuditByOrder = new Map<
    number,
    { userId: string | null; ip: string | null; createdAt: Date }
  >();
  const fillAuditByOrder = new Map<
    number,
    { userId: string | null; ip: string | null; createdAt: Date }
  >();
  for (const row of equipmentAuditRows) {
    const detail =
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? (row.detail as Record<string, unknown>)
        : {};
    const orderId = finiteInteger(detail.orderId);
    if (orderId == null) continue;
    const target =
      row.action === "marketplace.equipment_buy_order.create"
        ? createAuditByOrder
        : fillAuditByOrder;
    if (!target.has(orderId)) {
      target.set(orderId, {
        userId: row.userId,
        ip: row.ip,
        createdAt: row.createdAt,
      });
    }
  }
  const inboxByOrder = new Map<
    number,
    { createdAt: Date; claimedAt: Date | null }
  >();
  for (const row of equipmentInboxRows) {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const orderId = finiteInteger(payload.order_id);
    if (orderId != null && !inboxByOrder.has(orderId)) {
      inboxByOrder.set(orderId, {
        createdAt: row.createdAt,
        claimedAt: row.claimedAt,
      });
    }
  }
  const equipmentAudits = sales
    .filter((sale) => sale.orderId != null && sale.minimumPrice != null)
    .map((sale) => {
      const createAudit = createAuditByOrder.get(sale.orderId!);
      const fillAudit = fillAuditByOrder.get(sale.orderId!);
      const inbox = inboxByOrder.get(sale.orderId!);
      const repeatedPairTrades =
        sale.sellerId && sale.buyerId
          ? (pairs.get(`${sale.sellerId}:${sale.buyerId}`)?.trades ?? 0)
          : 0;
      const sameIp =
        createAudit?.ip != null &&
        fillAudit?.ip != null &&
        createAudit.ip === fillAudit.ip;
      const nearFloor =
        sale.grossGold <= Math.ceil(sale.minimumPrice! * 1.05);
      const risk = marketplaceEquipmentTradeRisk({
        sameIp,
        nearFloor,
        repeatedPairTrades,
      });
      return {
        orderId: sale.orderId!,
        sellerId: sale.sellerId,
        buyerId: sale.buyerId,
        itemId: sale.itemId,
        grossGold: sale.grossGold,
        minimumPrice: sale.minimumPrice!,
        power: sale.power,
        qualityPct: sale.qualityPct,
        sameIp,
        nearFloor,
        repeatedPairTrades,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskReasons: risk.reasons,
        orderCreatedAt: createAudit?.createdAt.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
        inboxCreatedAt: inbox?.createdAt.toISOString() ?? null,
        inboxClaimedAt: inbox?.claimedAt?.toISOString() ?? null,
        deliveryStatus: inbox
          ? inbox.claimedAt
            ? ("claimed" as const)
            : ("pending" as const)
          : ("missing" as const),
      };
    })
    .sort(
      (a, b) =>
        b.riskScore - a.riskScore || b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 50);
  const equipmentSignals = equipmentAudits
    .filter((audit) => audit.sameIp || audit.nearFloor)
    .map((audit) => ({
      kind: audit.sameIp ? ("same_ip_pair" as const) : ("floor_transfer" as const),
      severity: audit.sameIp ? ("danger" as const) : ("warning" as const),
      sellerId: audit.sellerId ?? "unknown",
      buyerId: audit.buyerId ?? "unknown",
      trades: 1,
      grossGold: audit.grossGold,
      itemId: audit.itemId,
    }));
  const suspicious = [
    ...equipmentSignals,
    ...repeatedPairSignals,
    ...abnormalPriceSignals,
  ].slice(0, 30);

  const expiredListings = activeListings.filter((row) => row.expiresAt <= now);
  const expiredOrders = activeOrders.filter((row) => row.expiresAt <= now);
  return Response.json({
    ok: true,
    generatedAt: now.toISOString(),
    summary: {
      ...summary,
      activeListings: activeListings.length,
      activeBuyOrders: activeOrders.length,
      expiredActiveListings: expiredListings.length,
      expiredActiveBuyOrders: expiredOrders.length,
      escrowGold: activeOrders.reduce((sum, row) => sum + row.goldEscrow, 0),
    },
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    popularItems,
    priceMovements,
    suspicious,
    equipmentAudits,
    stalled: [
      ...expiredListings.map((row) => ({ type: "listing", itemId: row.itemId, itemName: row.itemName, quantity: row.quantity, expiresAt: row.expiresAt })),
      ...expiredOrders.map((row) => ({ type: "buy_order", itemId: row.itemId, itemName: row.itemName, quantity: row.quantityRemaining, expiresAt: row.expiresAt })),
    ]
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, 30),
  });
}
