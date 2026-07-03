import { db } from "@/db";
import { economyEvents } from "@/db/schema";

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
  } catch (e) {
    console.error("[economyLog] 기록 실패", entry.eventType, e);
  }
}

export function recordEconomyEventSoon(entry: EconomyEventInput) {
  void recordEconomyEvent(entry);
}
