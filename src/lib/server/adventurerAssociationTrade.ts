import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { adventurerAssociationTradeWeekly } from "@/db/schema";
import {
  guildTradeContractTarget,
  guildTradeItem,
  guildTradeItemsForWeek,
} from "@/adventure/data/v2/guildTrade";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AssociationTradeWeekly = {
  weekKey: string;
  contractIds: string[];
  progress: Record<string, number>;
  completedIds: string[];
  target: number;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string"))]
    : [];
}

function progress(value: unknown, ids: readonly string[]): Record<string, number> {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    ids.map((id) => [id, Math.max(0, Math.floor(Number(record[id]) || 0))]),
  );
}

function fresh(weekKey: string, contractCount: number): AssociationTradeWeekly {
  const contractIds = guildTradeItemsForWeek(weekKey, 0, contractCount).map(
    (item) => item.id,
  );
  return {
    weekKey,
    contractIds,
    progress: Object.fromEntries(contractIds.map((id) => [id, 0])),
    completedIds: [],
    target: guildTradeContractTarget(20),
  };
}

export async function lockAssociationTradeWeekly(
  tx: Tx,
  weekKey: string,
  contractCount: number,
): Promise<AssociationTradeWeekly> {
  const initial = fresh(weekKey, contractCount);
  await tx
    .insert(adventurerAssociationTradeWeekly)
    .values({ id: "global", ...initial })
    .onConflictDoNothing();
  const row = (
    await tx
      .select()
      .from(adventurerAssociationTradeWeekly)
      .where(eq(adventurerAssociationTradeWeekly.id, "global"))
      .for("update")
      .limit(1)
  )[0];
  const ids = strings(row.contractIds).filter((id) => guildTradeItem(id));
  if (row.weekKey !== weekKey || ids.length === 0) {
    await saveAssociationTradeWeekly(tx, initial);
    return initial;
  }
  return {
    weekKey,
    contractIds: ids,
    progress: progress(row.progress, ids),
    completedIds: strings(row.completedIds).filter((id) => ids.includes(id)),
    target: Math.max(1, Math.floor(row.target)),
  };
}

export async function saveAssociationTradeWeekly(
  tx: Tx,
  state: AssociationTradeWeekly,
): Promise<void> {
  await tx
    .insert(adventurerAssociationTradeWeekly)
    .values({ id: "global", ...state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adventurerAssociationTradeWeekly.id,
      set: { ...state, updatedAt: new Date() },
    });
}
