import { eq, sql } from "drizzle-orm";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { CODEX_MASTERY_CATALOG_VERSION } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { CodexMasteryProgress } from "@/adventure/data/v2/codexMasteryTypes";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  codexMasteryTrophyDefinition,
  evaluateCodexMasteryTrophies,
  type CodexMasteryTrophyHistory,
  type CodexMasteryTrophyKind,
  type CodexMasteryTrophyPromotion,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import { codexTrophyHistory } from "@/db/schema";
import { readCodexMasteryProgressRows } from "./codexMasteryRepository";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

type PersistedTrophyRow = {
  trophyId: unknown;
  trophyKind: unknown;
  currentTier: unknown;
  tierAchievedAt: unknown;
  catalogVersion: unknown;
};

function isTier(value: unknown): value is CodexMasteryTrophyTier {
  return typeof value === "string" &&
    (CODEX_MASTERY_TROPHY_TIERS as readonly string[]).includes(value);
}

function tierIndex(tier: CodexMasteryTrophyTier): number {
  return CODEX_MASTERY_TROPHY_TIERS.indexOf(tier);
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function codexTrophyHistoryRowToState(
  row: PersistedTrophyRow,
): CodexMasteryTrophyHistory {
  const definition = typeof row.trophyId === "string"
    ? codexMasteryTrophyDefinition(row.trophyId)
    : null;
  if (
    !definition ||
    row.trophyKind !== definition.kind ||
    !isTier(row.currentTier) ||
    !Number.isSafeInteger(row.catalogVersion) ||
    Number(row.catalogVersion) < 1 ||
    !row.tierAchievedAt ||
    typeof row.tierAchievedAt !== "object" ||
    Array.isArray(row.tierAchievedAt)
  ) {
    throw new Error("codex trophy history row is malformed");
  }
  const rawTimes = row.tierAchievedAt as Record<string, unknown>;
  const tierAchievedAt: Partial<Record<CodexMasteryTrophyTier, string>> = {};
  for (const tier of CODEX_MASTERY_TROPHY_TIERS) {
    const value = rawTimes[tier];
    if (tierIndex(tier) <= tierIndex(row.currentTier)) {
      if (!validIsoTimestamp(value)) {
        throw new Error("codex trophy history row is malformed");
      }
      tierAchievedAt[tier] = value;
    } else if (value !== undefined && !validIsoTimestamp(value)) {
      throw new Error("codex trophy history row is malformed");
    }
  }
  return {
    trophyId: definition.id,
    kind: row.trophyKind as CodexMasteryTrophyKind,
    currentTier: row.currentTier,
    tierAchievedAt,
    catalogVersion: Number(row.catalogVersion),
  };
}

export async function readCodexMasteryTrophyHistory(
  executor: DbExecutor,
  userId: string,
): Promise<CodexMasteryTrophyHistory[]> {
  const rows = await executor
    .select({
      trophyId: codexTrophyHistory.trophyId,
      trophyKind: codexTrophyHistory.trophyKind,
      currentTier: codexTrophyHistory.currentTier,
      tierAchievedAt: codexTrophyHistory.tierAchievedAt,
      catalogVersion: codexTrophyHistory.catalogVersion,
    })
    .from(codexTrophyHistory)
    .where(eq(codexTrophyHistory.userId, userId));
  return rows.map(codexTrophyHistoryRowToState);
}

export type CodexMasteryTrophyReconcileResult = {
  changedFamilies: number;
  promotions: CodexMasteryTrophyPromotion[];
};

export type CodexMasteryTrophyRepositoryRuntime<Executor> = {
  lockUser(executor: Executor, userId: string): Promise<void>;
  readProgress(executor: Executor, userId: string): Promise<CodexMasteryProgress[]>;
  readHistory(executor: Executor, userId: string): Promise<CodexMasteryTrophyHistory[]>;
  writeHistory(
    executor: Executor,
    userId: string,
    history: readonly CodexMasteryTrophyHistory[],
    now: Date,
  ): Promise<void>;
};

function sameTimes(
  left: Partial<Record<CodexMasteryTrophyTier, string>>,
  right: Partial<Record<CodexMasteryTrophyTier, string>>,
): boolean {
  return CODEX_MASTERY_TROPHY_TIERS.every((tier) => left[tier] === right[tier]);
}

export async function reconcileCodexMasteryTrophiesWithRuntime<Executor>(
  runtime: CodexMasteryTrophyRepositoryRuntime<Executor>,
  executor: Executor,
  userId: string,
  catalog: CodexMasteryCatalog,
  now: Date,
  catalogVersion: number,
): Promise<CodexMasteryTrophyReconcileResult> {
  await runtime.lockUser(executor, userId);
  const [progressRows, history] = await Promise.all([
    runtime.readProgress(executor, userId),
    runtime.readHistory(executor, userId),
  ]);
  const evaluated = evaluateCodexMasteryTrophies({
    catalog,
    progressRows,
    history,
    now,
    catalogVersion,
  });
  const previousById = new Map(history.map((item) => [item.trophyId, item]));
  const changed = evaluated.trophies.flatMap((trophy) => {
    if (!trophy.currentTier) return [];
    const previous = previousById.get(trophy.trophyId);
    const next: CodexMasteryTrophyHistory = {
      trophyId: trophy.trophyId,
      kind: trophy.kind,
      currentTier: trophy.currentTier,
      tierAchievedAt: { ...trophy.tierAchievedAt },
      catalogVersion,
    };
    return previous &&
        previous.kind === next.kind &&
        previous.currentTier === next.currentTier &&
        previous.catalogVersion === next.catalogVersion &&
        sameTimes(previous.tierAchievedAt, next.tierAchievedAt)
      ? []
      : [next];
  });
  if (changed.length > 0) {
    await runtime.writeHistory(executor, userId, changed, now);
  }
  return {
    changedFamilies: changed.length,
    promotions: evaluated.promotions,
  };
}

const DRIZZLE_TROPHY_RUNTIME: CodexMasteryTrophyRepositoryRuntime<
  DbTransactionExecutor
> = {
  async lockUser(executor, userId) {
    await executor.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`codex-mastery-trophy:${userId}`}, 0)
      )
    `);
  },
  readProgress: readCodexMasteryProgressRows,
  readHistory: readCodexMasteryTrophyHistory,
  async writeHistory(executor, userId, history, now) {
    for (const item of history) {
      await executor
        .insert(codexTrophyHistory)
        .values({
          userId,
          trophyId: item.trophyId,
          trophyKind: item.kind,
          currentTier: item.currentTier,
          tierAchievedAt: item.tierAchievedAt,
          catalogVersion: item.catalogVersion,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [codexTrophyHistory.userId, codexTrophyHistory.trophyId],
          set: {
            trophyKind: item.kind,
            currentTier: item.currentTier,
            tierAchievedAt: item.tierAchievedAt,
            catalogVersion: item.catalogVersion,
            updatedAt: now,
          },
        });
    }
  },
};

export function reconcileCodexMasteryTrophies(
  executor: DbTransactionExecutor,
  userId: string,
  catalog: CodexMasteryCatalog,
  now: Date,
  catalogVersion = CODEX_MASTERY_CATALOG_VERSION,
): Promise<CodexMasteryTrophyReconcileResult> {
  return reconcileCodexMasteryTrophiesWithRuntime(
    DRIZZLE_TROPHY_RUNTIME,
    executor,
    userId,
    catalog,
    now,
    catalogVersion,
  );
}
