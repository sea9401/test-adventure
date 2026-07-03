import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { recordOpsSignal } from "@/lib/server/opsAlert";

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

function boundedText(value: string | null | undefined, max: number) {
  if (!value) return null;
  return value.slice(0, max);
}

export async function recordEconomyEvent(entry: EconomyEventInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.insert(economyEvents).values({
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
    });
    recordEconomyOpsSignal(entry);
  } catch (e) {
    console.error("[economyLog] 기록 실패", entry.eventType, e);
  }
}

export function recordEconomyEventSoon(entry: EconomyEventInput) {
  void recordEconomyEvent(entry);
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
  const goldDelta = Math.abs(Math.trunc(entry.goldDelta ?? 0));
  if (goldDelta >= 500_000) {
    recordOpsSignal({
      key: "economy:large-gold-delta",
      label: "large gold movement detected",
      threshold: 3,
      windowMs: 10 * 60_000,
      detail: {
        eventType: entry.eventType,
        goldDelta: entry.goldDelta ?? 0,
        userId: entry.userId ?? null,
      },
    });
  }

  if (entry.eventType.startsWith("reward.failure.")) {
    recordOpsSignal({
      key: `reward-failure:${entry.eventType}`,
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
