import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { recordOpsSignal } from "@/lib/server/opsAlert";
import { isLargeGoldMovement } from "@/lib/server/opsEconomyThresholds";
import {
  assessExtremeLowMarketplacePrice,
  type ExtremeLowMarketplacePriceAssessment,
} from "@/lib/server/opsMarketplaceLowPrice";
import { equipmentBuyOrderMinimumPrice } from "@/lib/server/marketplaceV2";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { createBestEffortBatcher } from "@/lib/server/bestEffortBatcher";
import { runOutsideRequestProfile } from "@/lib/server/runtimeProfiler/requestContext";

export type EconomyEventInput = {
  userId?: string | null;
  counterpartyUserId?: string | null;
  eventType: string;
  goldDelta?: number;
  itemKind?: string | null;
  itemId?: string | null;
  quantity?: number | null;
  detail?: Record<string, unknown> | null;
};

const ECONOMY_EVENT_BATCH_SIZE = 100;
const ECONOMY_EVENT_BATCH_DELAY_MS = 25;
const ECONOMY_EVENT_QUEUE_ALERT_SIZE = 500;

export type EconomyEventBatchMetrics = {
  startedAt: string;
  pending: number;
  inFlight: number;
  successfulBatches: number;
  successfulEntries: number;
  averageBatchSize: number;
  maxBatchSize: number;
  failedBatches: number;
  failedEntries: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

type MutableEconomyEventBatchMetrics = Omit<
  EconomyEventBatchMetrics,
  "pending" | "inFlight" | "averageBatchSize"
>;

type EconomyEventBatcher = ReturnType<
  typeof createBestEffortBatcher<EconomyEventInput>
>;

declare global {
  var __adventureEconomyEventBatcher: EconomyEventBatcher | undefined;
  var __adventureEconomyEventBatchMetrics:
    | MutableEconomyEventBatchMetrics
    | undefined;
}

function mutableEconomyEventBatchMetrics(): MutableEconomyEventBatchMetrics {
  globalThis.__adventureEconomyEventBatchMetrics ??= {
    startedAt: new Date().toISOString(),
    successfulBatches: 0,
    successfulEntries: 0,
    maxBatchSize: 0,
    failedBatches: 0,
    failedEntries: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
  };
  return globalThis.__adventureEconomyEventBatchMetrics;
}

export function getEconomyEventBatchMetrics(): EconomyEventBatchMetrics {
  const metrics = mutableEconomyEventBatchMetrics();
  const queue = globalThis.__adventureEconomyEventBatcher?.snapshot() ?? {
    pending: 0,
    inFlight: 0,
  };
  return {
    ...metrics,
    ...queue,
    averageBatchSize:
      metrics.successfulBatches > 0
        ? Math.round(
            (metrics.successfulEntries / metrics.successfulBatches) * 100,
          ) / 100
        : 0,
  };
}

function boundedText(value: string | null | undefined, max: number) {
  if (!value) return null;
  return value.slice(0, max);
}

function economyEventValues(entry: EconomyEventInput) {
  return {
    userId: entry.userId ?? null,
    counterpartyUserId: entry.counterpartyUserId ?? null,
    eventType: entry.eventType.slice(0, 160),
    goldDelta: Math.trunc(entry.goldDelta ?? 0),
    itemKind: boundedText(entry.itemKind, 80),
    itemId: boundedText(entry.itemId, 160),
    quantity:
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity)
        ? Math.trunc(entry.quantity)
        : null,
    detail: entry.detail ?? null,
  };
}

export async function recordEconomyEvent(entry: EconomyEventInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const [inserted] = await db
      .insert(economyEvents)
      .values(economyEventValues(entry))
      .returning({ id: economyEvents.id });
    recordEconomyOpsSignal(entry);
    if (inserted) {
      try {
        await recordExtremeLowMarketplacePriceSignal(entry, inserted.id);
      } catch (e) {
        console.error("[economyLog] 거래소 저가 경보 판정 실패", e);
      }
    }
  } catch (e) {
    console.error("[economyLog] 기록 실패", entry.eventType, e);
  }
}

const MARKETPLACE_COMPLETED_EVENT_TYPES = [
  "marketplace.buy",
  "marketplace.buy_order.fill",
  "marketplace.equipment_buy_order.fill",
  "marketplace.auction.sell",
] as const;

type MarketplaceTradeEntry = {
  eventType: string;
  goldDelta?: number | null;
  itemKind?: string | null;
  itemId?: string | null;
  quantity?: number | null;
  detail?: unknown;
};

type MarketplaceCompletedTrade = {
  grossGold: number;
  quantity: number;
  itemKind: string;
  itemId: string;
};

function detailNumber(detail: unknown, key: string): number | null {
  if (!detail || typeof detail !== "object") return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function marketplaceCompletedTrade(
  entry: MarketplaceTradeEntry,
): MarketplaceCompletedTrade | null {
  const itemKind = boundedText(entry.itemKind, 80);
  const itemId = boundedText(entry.itemId, 160);
  const quantity = Math.max(1, Math.trunc(entry.quantity ?? 1));
  if (!itemKind || !itemId) return null;

  let grossGold: number | null = null;
  if (entry.eventType === "marketplace.buy") {
    grossGold = Math.abs(Math.trunc(entry.goldDelta ?? 0));
  } else if (
    entry.eventType === "marketplace.buy_order.fill" ||
    entry.eventType === "marketplace.equipment_buy_order.fill"
  ) {
    grossGold = detailNumber(entry.detail, "escrowGoldUsed");
  } else if (entry.eventType === "marketplace.auction.sell") {
    grossGold = detailNumber(entry.detail, "grossGold");
  }
  if (grossGold == null || grossGold <= 0) return null;
  return { grossGold, quantity, itemKind, itemId };
}

async function recordExtremeLowMarketplacePriceSignal(
  entry: EconomyEventInput,
  insertedEventId: number,
) {
  const trade = marketplaceCompletedTrade(entry);
  if (!trade) return;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const historyRows = await db
    .select({
      eventType: economyEvents.eventType,
      goldDelta: economyEvents.goldDelta,
      itemKind: economyEvents.itemKind,
      itemId: economyEvents.itemId,
      quantity: economyEvents.quantity,
      detail: economyEvents.detail,
    })
    .from(economyEvents)
    .where(
      and(
        inArray(economyEvents.eventType, [...MARKETPLACE_COMPLETED_EVENT_TYPES]),
        eq(economyEvents.itemKind, trade.itemKind),
        eq(economyEvents.itemId, trade.itemId),
        gte(economyEvents.createdAt, since),
        ne(economyEvents.id, insertedEventId),
      ),
    )
    .orderBy(desc(economyEvents.createdAt))
    .limit(100);
  const historicalUnitPrices = historyRows.flatMap((row) => {
    const historical = marketplaceCompletedTrade(row);
    return historical
      ? [Math.max(1, Math.ceil(historical.grossGold / historical.quantity))]
      : [];
  });
  const assessment = assessExtremeLowMarketplacePrice({
    grossGold: trade.grossGold,
    quantity: trade.quantity,
    historicalUnitPrices,
    catalogUnitFloor:
      trade.itemKind === "equip"
        ? equipmentBuyOrderMinimumPrice(trade.itemId)
        : null,
  });
  if (!assessment) return;

  const auction = entry.eventType === "marketplace.auction.sell";
  sendExtremeLowMarketplacePriceSignal({
    entry,
    trade,
    assessment,
    insertedEventId,
    buyerUserId: auction
      ? entry.counterpartyUserId ?? null
      : entry.userId ?? null,
    sellerUserId: auction
      ? entry.userId ?? null
      : entry.counterpartyUserId ?? null,
  });
}

function sendExtremeLowMarketplacePriceSignal(args: {
  entry: EconomyEventInput;
  trade: MarketplaceCompletedTrade;
  assessment: ExtremeLowMarketplacePriceAssessment;
  insertedEventId: number;
  buyerUserId: string | null;
  sellerUserId: string | null;
}) {
  recordOpsSignal({
    key: `economy:marketplace-extreme-low:${args.insertedEventId}`,
    alertType: "economy.marketplace_extreme_low_price",
    label: "marketplace item traded at an extremely low price",
    threshold: 1,
    windowMs: 24 * 60 * 60_000,
    detail: {
      channel: "economy",
      eventType: args.entry.eventType,
      itemKind: args.trade.itemKind,
      itemId: args.trade.itemId,
      quantity: args.trade.quantity,
      actualTradeGold: args.trade.grossGold,
      actualUnitPrice: args.assessment.actualUnitPrice,
      referenceUnitPrice: args.assessment.referenceUnitPrice,
      priceRatioPct: args.assessment.priceRatioPct,
      referenceSampleCount: args.assessment.referenceSampleCount,
      referenceType: args.assessment.referenceType,
      buyerUserId: args.buyerUserId,
      sellerUserId: args.sellerUserId,
    },
  });
}

export function recordEconomyEventSoon(entry: EconomyEventInput) {
  if (!process.env.DATABASE_URL) return;
  if (isBatchedEconomyEvent(entry)) {
    const batcher = economyEventBatcher();
    batcher.enqueue({
      ...entry,
      detail: entry.detail ? { ...entry.detail } : entry.detail,
    });
    const queue = batcher.snapshot();
    const queueDepth = queue.pending + queue.inFlight;
    if (queueDepth >= ECONOMY_EVENT_QUEUE_ALERT_SIZE) {
      recordOpsSignal({
        key: "database:economy-event-batch-queue",
        alertType: "database.economy_batch_queue_backlog",
        label: "economy event batch queue is backlogged",
        threshold: 1,
        windowMs: 10 * 60_000,
        detail: {
          channel: "default",
          queueDepth,
          pending: queue.pending,
          inFlight: queue.inFlight,
        },
      });
    }
    return;
  }
  void recordEconomyEvent(entry);
}

export function isBatchedEconomyEvent(entry: EconomyEventInput): boolean {
  return (
    entry.eventType.startsWith("life.") ||
    entry.eventType === "currency.fishing.catch"
  );
}

function economyEventBatcher(): EconomyEventBatcher {
  globalThis.__adventureEconomyEventBatcher ??= createBestEffortBatcher({
    maxBatchSize: ECONOMY_EVENT_BATCH_SIZE,
    flushDelayMs: ECONOMY_EVENT_BATCH_DELAY_MS,
    writeBatch: async (entries) => {
      await runOutsideRequestProfile(() =>
        db.insert(economyEvents).values(entries.map(economyEventValues)),
      );
      const metrics = mutableEconomyEventBatchMetrics();
      metrics.successfulBatches += 1;
      metrics.successfulEntries += entries.length;
      metrics.maxBatchSize = Math.max(metrics.maxBatchSize, entries.length);
      metrics.lastSuccessAt = new Date().toISOString();
      for (const entry of entries) recordEconomyOpsSignal(entry);
    },
    onError: (error, entries) => {
      const metrics = mutableEconomyEventBatchMetrics();
      metrics.failedBatches += 1;
      metrics.failedEntries += entries.length;
      metrics.lastFailureAt = new Date().toISOString();
      const eventTypes = [...new Set(entries.map((entry) => entry.eventType))]
        .slice(0, 10)
        .map((eventType) => eventType.slice(0, 160));
      console.error("[economyLog] 배치 기록 실패", {
        size: entries.length,
        eventTypes,
        error,
      });
      recordOpsSignal({
        key: "database:economy-event-batch-write",
        alertType: "database.economy_batch_write_failed",
        label: "economy event batch insert failed",
        threshold: 1,
        windowMs: 10 * 60_000,
        detail: {
          channel: "default",
          batchSize: entries.length,
          failedBatches: metrics.failedBatches,
          failedEntries: metrics.failedEntries,
        },
      });
    },
  });
  return globalThis.__adventureEconomyEventBatcher;
}

export function recordRewardFailureSoon(entry: {
  userId?: string | null;
  source: string;
  error: string;
  detail?: Record<string, unknown> | null;
}) {
  recordEconomyEventSoon({
    userId: entry.userId ?? null,
    eventType: `reward.failure.${entry.source}`.slice(0, 160),
    itemKind: "failure",
    itemId: entry.error.slice(0, 160),
    quantity: 1,
    detail: entry.detail ?? null,
  });
}

function recordEconomyOpsSignal(entry: EconomyEventInput) {
  const largeGoldSignal = buildLargeGoldMovementSignal(entry);
  if (largeGoldSignal) recordOpsSignal(largeGoldSignal);

  if (entry.eventType.startsWith("reward.failure.")) {
    recordOpsSignal({
      key: `reward-failure:${entry.eventType}`,
      alertType: "reward.claim_failure",
      label: `reward claim failures: ${entry.eventType}`,
      threshold: 5,
      windowMs: 10 * 60_000,
      detail: {
        eventType: entry.eventType,
        userId: entry.userId ?? null,
        error: entry.itemId ?? null,
      },
    });
  }
}

function detailText(detail: unknown, key: string): string | null {
  if (!detail || typeof detail !== "object") return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function detailFiniteNumber(detail: unknown, key: string): number | null {
  if (!detail || typeof detail !== "object") return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function economyItemName(entry: EconomyEventInput): string | null {
  const detailName = detailText(entry.detail, "itemName");
  if (detailName) return detailName;
  if (!entry.itemId) return null;
  if (entry.itemKind === "equip") {
    return (
      V2_EQUIPMENT[entry.itemId as keyof typeof V2_EQUIPMENT]?.name ??
      entry.itemId
    );
  }
  if (entry.itemKind === "material") {
    return V2_MATERIALS[entry.itemId]?.name ?? entry.itemId;
  }
  return entry.itemId;
}

export function buildLargeGoldMovementSignal(
  entry: EconomyEventInput,
  occurredAt = new Date(),
) {
  const goldDelta = Math.trunc(entry.goldDelta ?? 0);
  if (!isLargeGoldMovement(goldDelta)) return null;
  const itemName = economyItemName(entry);
  const listingId = detailFiniteNumber(entry.detail, "listingId");
  const orderId = detailFiniteNumber(entry.detail, "orderId");
  const grossGold = detailFiniteNumber(entry.detail, "grossGold");
  const taxRate = detailFiniteNumber(entry.detail, "taxRate");
  return {
    key: "economy:large-gold-delta",
    alertType: "economy.large_gold_movement",
    label: "large gold movement detected",
    threshold: 3,
    windowMs: 10 * 60_000,
    detail: { channel: "economy" },
    sample: {
      occurredAt: occurredAt.toISOString(),
      eventType: entry.eventType,
      goldDelta,
      ...(entry.userId ? { userId: entry.userId } : {}),
      ...(entry.counterpartyUserId
        ? { counterpartyUserId: entry.counterpartyUserId }
        : {}),
      ...(entry.itemKind ? { itemKind: entry.itemKind } : {}),
      ...(entry.itemId ? { itemId: entry.itemId } : {}),
      ...(itemName ? { itemName } : {}),
      ...(typeof entry.quantity === "number" && Number.isFinite(entry.quantity)
        ? { quantity: Math.trunc(entry.quantity) }
        : {}),
      ...(listingId !== null ? { listingId: Math.trunc(listingId) } : {}),
      ...(orderId !== null ? { orderId: Math.trunc(orderId) } : {}),
      ...(grossGold !== null ? { grossGold: Math.trunc(grossGold) } : {}),
      ...(taxRate !== null ? { taxRate } : {}),
    },
  };
}
