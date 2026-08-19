import { asc, eq, gt } from "drizzle-orm";
import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCountStage,
  type CodexMasteryProgress,
  type CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import { codexMasteryProgress, codexMasterySummary } from "@/db/schema";
import type { DbExecutor } from "./savesKv";
import {
  codexMasteryRowToProgress,
  codexMasterySummaryRowToState,
  emptyCodexMasterySummary,
  type CodexMasterySummaryState,
} from "./codexMasteryRepository";

export type CodexMasteryRepairProgressRow = CodexMasteryProgress & {
  updatedAt: Date | null;
};

export type CodexMasteryRepairStore = {
  readSummary(userId: string): Promise<CodexMasterySummaryState>;
  readProgress(userId: string): Promise<CodexMasteryRepairProgressRow[]>;
  saveSummary(
    userId: string,
    summary: CodexMasterySummaryState,
    now: Date,
  ): Promise<void>;
};

export type CodexMasterySummaryDifference = {
  before: number | Date | null;
  after: number | Date | null;
};

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

function tierIndex(tier: CodexMasteryTier): number {
  return tier === "none" ? -1 : CODEX_MASTERY_STAGES.indexOf(tier);
}

function safeAdd(value: number, delta: number): number {
  const result = value + delta;
  if (!Number.isSafeInteger(result)) {
    throw new Error("codex mastery summary rebuild would overflow a safe integer");
  }
  return result;
}

function validUpdatedAt(value: Date | null): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

function countDistinctRowSeals(sealIds: readonly string[]): number {
  return new Set(sealIds.filter((sealId) =>
    typeof sealId === "string" && sealId.trim().length > 0,
  )).size;
}

/** Rebuilds a user summary solely from its persisted per-entry progress rows. */
export function aggregateCodexMasterySummary(
  rows: readonly CodexMasteryRepairProgressRow[],
): CodexMasterySummaryState {
  const summary = emptyCodexMasterySummary();
  let latestUpdatedAt: Date | null = null;

  for (const row of rows) {
    summary.totalScoreMilli = safeAdd(summary.totalScoreMilli, row.scoreMilli);
    summary.categoryScoreMilli[row.category] = safeAdd(
      summary.categoryScoreMilli[row.category],
      row.scoreMilli,
    );
    summary.sealCount = safeAdd(summary.sealCount, countDistinctRowSeals(row.sealIds));

    const currentTierIndex = tierIndex(row.currentTier);
    for (const stage of COUNT_STAGES) {
      if (currentTierIndex >= tierIndex(stage)) {
        summary.stageCounts[stage] = safeAdd(summary.stageCounts[stage], 1);
      }
    }

    const updatedAt = validUpdatedAt(row.updatedAt);
    if (!latestUpdatedAt || (updatedAt && updatedAt > latestUpdatedAt)) {
      latestUpdatedAt = updatedAt;
    }
  }

  summary.scoreReachedAt = summary.totalScoreMilli > 0 ? latestUpdatedAt : null;
  return summary;
}

function valuesEqual(
  before: number | Date | null,
  after: number | Date | null,
): boolean {
  if (before instanceof Date && after instanceof Date) {
    return before.getTime() === after.getTime();
  }
  return before === after;
}

export function compareCodexMasterySummary(
  before: CodexMasterySummaryState,
  after: CodexMasterySummaryState,
): Record<string, CodexMasterySummaryDifference> {
  const differences: Record<string, CodexMasterySummaryDifference> = {};
  const addDifference = (
    key: string,
    previous: number | Date | null,
    next: number | Date | null,
  ) => {
    if (!valuesEqual(previous, next)) differences[key] = { before: previous, after: next };
  };

  addDifference("totalScoreMilli", before.totalScoreMilli, after.totalScoreMilli);
  for (const category of CODEX_MASTERY_CATEGORIES) {
    addDifference(
      `categoryScoreMilli.${category}`,
      before.categoryScoreMilli[category],
      after.categoryScoreMilli[category],
    );
  }
  for (const stage of COUNT_STAGES) {
    addDifference(
      `stageCounts.${stage}`,
      before.stageCounts[stage],
      after.stageCounts[stage],
    );
  }
  addDifference("sealCount", before.sealCount, after.sealCount);
  addDifference("scoreReachedAt", before.scoreReachedAt, after.scoreReachedAt);
  return differences;
}

function preserveExactScoreReachTime(
  before: CodexMasterySummaryState,
  rebuilt: CodexMasterySummaryState,
): CodexMasterySummaryState {
  if (
    rebuilt.totalScoreMilli > 0 &&
    rebuilt.totalScoreMilli === before.totalScoreMilli &&
    validUpdatedAt(before.scoreReachedAt)
  ) {
    return { ...rebuilt, scoreReachedAt: before.scoreReachedAt };
  }
  return rebuilt;
}

export async function repairCodexMasterySummary(
  store: CodexMasteryRepairStore,
  userId: string,
  options: { apply: boolean; now: Date },
): Promise<{
  changed: boolean;
  applied: boolean;
  before: CodexMasterySummaryState;
  after: CodexMasterySummaryState;
  differences: Record<string, CodexMasterySummaryDifference>;
}> {
  const before = await store.readSummary(userId);
  const after = preserveExactScoreReachTime(
    before,
    aggregateCodexMasterySummary(await store.readProgress(userId)),
  );
  const differences = compareCodexMasterySummary(before, after);
  const changed = Object.keys(differences).length > 0;
  if (options.apply && changed) await store.saveSummary(userId, after, options.now);
  return {
    changed,
    applied: options.apply && changed,
    before,
    after,
    differences,
  };
}

export async function listCodexMasterySummaryUserIds(
  executor: DbExecutor,
  options: { afterUserId?: string; limit: number },
): Promise<string[]> {
  const query = executor
    .select({ userId: codexMasterySummary.userId })
    .from(codexMasterySummary)
    .orderBy(asc(codexMasterySummary.userId))
    .limit(options.limit);
  const rows = options.afterUserId
    ? await executor
      .select({ userId: codexMasterySummary.userId })
      .from(codexMasterySummary)
      .where(gt(codexMasterySummary.userId, options.afterUserId))
      .orderBy(asc(codexMasterySummary.userId))
      .limit(options.limit)
    : await query;
  return rows.map((row) => row.userId);
}

export function createDrizzleCodexMasteryRepairStore(
  executor: DbExecutor,
): CodexMasteryRepairStore {
  return {
    async readSummary(userId) {
      const row = (await executor
        .select()
        .from(codexMasterySummary)
        .where(eq(codexMasterySummary.userId, userId))
        .limit(1))[0];
      if (!row) throw new Error("codex mastery summary row was not found");
      return codexMasterySummaryRowToState(row);
    },
    async readProgress(userId) {
      const rows = await executor
        .select()
        .from(codexMasteryProgress)
        .where(eq(codexMasteryProgress.userId, userId));
      return rows.map((row) => ({
        ...codexMasteryRowToProgress(row),
        updatedAt: validUpdatedAt(row.updatedAt),
      }));
    },
    async saveSummary(userId, summary, now) {
      const saved = await executor
        .update(codexMasterySummary)
        .set({
          totalScoreMilli: summary.totalScoreMilli,
          equipmentScoreMilli: summary.categoryScoreMilli.equipment,
          fishScoreMilli: summary.categoryScoreMilli.fish,
          monsterScoreMilli: summary.categoryScoreMilli.monster,
          cookingScoreMilli: summary.categoryScoreMilli.cooking,
          lifeScoreMilli: summary.categoryScoreMilli.life,
          jobScoreMilli: summary.categoryScoreMilli.job,
          bronzeCount: summary.stageCounts.bronze,
          silverCount: summary.stageCounts.silver,
          goldCount: summary.stageCounts.gold,
          platinumCount: summary.stageCounts.platinum,
          diamondCount: summary.stageCounts.diamond,
          legendaryCount: summary.stageCounts.legendary,
          sealCount: summary.sealCount,
          scoreReachedAt: summary.scoreReachedAt,
          updatedAt: now,
        })
        .where(eq(codexMasterySummary.userId, userId))
        .returning({ userId: codexMasterySummary.userId });
      if (saved.length !== 1) {
        throw new Error("codex mastery summary row was not saved");
      }
    },
  };
}
