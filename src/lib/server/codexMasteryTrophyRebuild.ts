import { asc, gt } from "drizzle-orm";
import type { db } from "@/db";
import { codexMasteryProgress, codexTrophyHistory } from "@/db/schema";
import type { CodexMasteryCatalog } from "@/adventure/data/v2/codexMasteryCatalog";
import { CODEX_MASTERY_CATALOG_VERSION } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import type { CodexMasteryProgress } from "@/adventure/data/v2/codexMasteryTypes";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  evaluateCodexMasteryTrophies,
  type CodexMasteryTrophyHistory,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import { readCodexMasteryProgressRows } from "./codexMasteryRepository";
import {
  readCodexMasteryTrophyHistory,
  reconcileCodexMasteryTrophies,
  type CodexMasteryTrophyReconcileResult,
} from "./codexMasteryTrophyRepository";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

export type CodexMasteryTrophyRebuildResult = {
  applied: boolean;
  changedFamilies: number;
  promotions: number;
};

export type CodexMasteryTrophyRebuildRuntime<ReadExecutor, WriteExecutor> = {
  readProgress(executor: ReadExecutor, userId: string): Promise<CodexMasteryProgress[]>;
  readHistory(executor: ReadExecutor, userId: string): Promise<CodexMasteryTrophyHistory[]>;
  transaction<T>(run: (executor: WriteExecutor) => Promise<T>): Promise<T>;
  reconcile(
    executor: WriteExecutor,
    userId: string,
    catalog: CodexMasteryCatalog,
    now: Date,
    catalogVersion: number,
  ): Promise<CodexMasteryTrophyReconcileResult>;
};

function sameTimes(
  left: Partial<Record<CodexMasteryTrophyTier, string>>,
  right: Partial<Record<CodexMasteryTrophyTier, string>>,
): boolean {
  return CODEX_MASTERY_TROPHY_TIERS.every((tier) => left[tier] === right[tier]);
}

export async function rebuildCodexMasteryTrophiesWithRuntime<
  ReadExecutor,
  WriteExecutor,
>(
  runtime: CodexMasteryTrophyRebuildRuntime<ReadExecutor, WriteExecutor>,
  readExecutor: ReadExecutor,
  userId: string,
  catalog: CodexMasteryCatalog,
  options: { apply: boolean; now: Date; catalogVersion: number },
): Promise<CodexMasteryTrophyRebuildResult> {
  if (options.apply) {
    return runtime.transaction(async (executor) => {
      const result = await runtime.reconcile(
        executor,
        userId,
        catalog,
        options.now,
        options.catalogVersion,
      );
      return {
        applied: true,
        changedFamilies: result.changedFamilies,
        promotions: result.promotions.length,
      };
    });
  }

  const [progressRows, history] = await Promise.all([
    runtime.readProgress(readExecutor, userId),
    runtime.readHistory(readExecutor, userId),
  ]);
  const evaluated = evaluateCodexMasteryTrophies({
    catalog,
    progressRows,
    history,
    now: options.now,
    catalogVersion: options.catalogVersion,
  });
  const previousById = new Map(history.map((item) => [item.trophyId, item]));
  const changedFamilies = evaluated.trophies.filter((trophy) => {
    if (!trophy.currentTier) return false;
    const previous = previousById.get(trophy.trophyId);
    return !previous ||
      previous.kind !== trophy.kind ||
      previous.currentTier !== trophy.currentTier ||
      previous.catalogVersion !== options.catalogVersion ||
      !sameTimes(previous.tierAchievedAt, trophy.tierAchievedAt);
  }).length;
  return {
    applied: false,
    changedFamilies,
    promotions: evaluated.promotions.length,
  };
}

export function mergeCodexMasteryTrophyUserIds(
  progressUserIds: readonly string[],
  trophyUserIds: readonly string[],
  limit: number,
): string[] {
  return [...new Set([...progressUserIds, ...trophyUserIds])]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .slice(0, limit);
}

export async function listCodexMasteryTrophyUserIds(
  executor: DbExecutor,
  options: { afterUserId?: string; limit: number },
): Promise<string[]> {
  const progressQuery = executor
    .selectDistinct({ userId: codexMasteryProgress.userId })
    .from(codexMasteryProgress);
  const trophyQuery = executor
    .selectDistinct({ userId: codexTrophyHistory.userId })
    .from(codexTrophyHistory);
  const progressRows = options.afterUserId
    ? await progressQuery
      .where(gt(codexMasteryProgress.userId, options.afterUserId))
      .orderBy(asc(codexMasteryProgress.userId))
      .limit(options.limit)
    : await progressQuery
      .orderBy(asc(codexMasteryProgress.userId))
      .limit(options.limit);
  const trophyRows = options.afterUserId
    ? await trophyQuery
      .where(gt(codexTrophyHistory.userId, options.afterUserId))
      .orderBy(asc(codexTrophyHistory.userId))
      .limit(options.limit)
    : await trophyQuery
      .orderBy(asc(codexTrophyHistory.userId))
      .limit(options.limit);
  return mergeCodexMasteryTrophyUserIds(
    progressRows.map((row) => row.userId),
    trophyRows.map((row) => row.userId),
    options.limit,
  );
}

export function rebuildCodexMasteryTrophiesWithDatabase(
  database: typeof db,
  userId: string,
  catalog: CodexMasteryCatalog,
  options: { apply: boolean; now: Date; catalogVersion?: number },
): Promise<CodexMasteryTrophyRebuildResult> {
  const runtime: CodexMasteryTrophyRebuildRuntime<
    DbExecutor,
    DbTransactionExecutor
  > = {
    readProgress: readCodexMasteryProgressRows,
    readHistory: readCodexMasteryTrophyHistory,
    transaction: (run) => database.transaction(run),
    reconcile: reconcileCodexMasteryTrophies,
  };
  return rebuildCodexMasteryTrophiesWithRuntime(
    runtime,
    database,
    userId,
    catalog,
    {
      ...options,
      catalogVersion: options.catalogVersion ?? CODEX_MASTERY_CATALOG_VERSION,
    },
  );
}
