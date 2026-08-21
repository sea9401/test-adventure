import { and, asc, eq, or, sql } from "drizzle-orm";
import {
  CODEX_MASTERY_CATEGORIES,
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
  type CodexMasteryProgress,
  type CodexMasteryStage,
  type CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import { codexMasteryProgress, codexMasterySummary } from "@/db/schema";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";
import type { CodexMasteryTrophyPromotion } from "@/adventure/data/v2/codexMasteryTrophies";

type CodexMasterySummaryStage = Exclude<CodexMasteryStage, "discovered">;

export type CodexMasterySummaryState = {
  totalScoreMilli: number;
  categoryScoreMilli: Record<CodexMasteryCategory, number>;
  stageCounts: Record<CodexMasterySummaryStage, number>;
  sealCount: number;
  scoredCategoryCount: number;
  scoreReachedAt: Date | null;
  categoryScoreReachedAt: Record<CodexMasteryCategory, Date | null>;
};

export type CodexMasteryStore = {
  lock(input: {
    userId: string;
    category: CodexMasteryCategory;
    entryId: string;
  }, now: Date): Promise<{
    summary: CodexMasterySummaryState;
    progress: CodexMasteryProgress;
  }>;
  save(input: {
    userId: string;
    summary: CodexMasterySummaryState;
    progress: CodexMasteryProgress;
  }, now: Date): Promise<void>;
  reconcileTrophies?(
    userId: string,
    now: Date,
  ): Promise<{ promotions: CodexMasteryTrophyPromotion[] }>;
};

export type CodexMasteryBatchStore = {
  lockBatch(input: {
    userId: string;
    entries: readonly {
      category: CodexMasteryCategory;
      entryId: string;
    }[];
  }, now: Date): Promise<{
    summary: CodexMasterySummaryState;
    progress: CodexMasteryProgress[];
  }>;
  saveBatch(input: {
    userId: string;
    summary: CodexMasterySummaryState;
    progress: readonly CodexMasteryProgress[];
  }, now: Date): Promise<void>;
  reconcileTrophies?(
    userId: string,
    now: Date,
  ): Promise<{ promotions: CodexMasteryTrophyPromotion[] }>;
};

type PersistedProgressRow = {
  category: unknown;
  entryId: string;
  count: unknown;
  bestValue: unknown;
  currentTier: unknown;
  sealIds: unknown;
  tierAchievedAt: unknown;
  scoreMilli: unknown;
};

type PersistedSummaryRow = {
  totalScoreMilli: unknown;
  equipmentScoreMilli: unknown;
  fishScoreMilli: unknown;
  monsterScoreMilli: unknown;
  cookingScoreMilli: unknown;
  lifeScoreMilli: unknown;
  jobScoreMilli: unknown;
  bronzeCount: unknown;
  silverCount: unknown;
  goldCount: unknown;
  platinumCount: unknown;
  diamondCount: unknown;
  legendaryCount: unknown;
  sealCount: unknown;
  scoredCategoryCount: unknown;
  scoreReachedAt: unknown;
  equipmentScoreReachedAt: unknown;
  fishScoreReachedAt: unknown;
  monsterScoreReachedAt: unknown;
  cookingScoreReachedAt: unknown;
  lifeScoreReachedAt: unknown;
  jobScoreReachedAt: unknown;
};

function nonNegativeSafeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function nonNegativeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isTier(value: unknown): value is CodexMasteryTier {
  return value === "none" || (
    typeof value === "string" &&
    (CODEX_MASTERY_STAGES as readonly string[]).includes(value)
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.,]\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  return offsetHourText === undefined || (
    Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59
  );
}

function tierIndex(tier: CodexMasteryTier): number {
  return tier === "none" ? -1 : CODEX_MASTERY_STAGES.indexOf(tier);
}

function normalizedSealIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((sealId): sealId is string =>
    typeof sealId === "string" && sealId.trim().length > 0,
  ))];
}

function lockedCodexMasteryRowToProgress(
  row: PersistedProgressRow,
): CodexMasteryProgress {
  const sealIdsAreValid = Array.isArray(row.sealIds) &&
    row.sealIds.every((sealId) =>
      typeof sealId === "string" && sealId.trim().length > 0
    ) &&
    new Set(row.sealIds).size === row.sealIds.length;
  const rowIsStructurallyValid =
    typeof row.category === "string" &&
    (CODEX_MASTERY_CATEGORIES as readonly string[]).includes(row.category) &&
    typeof row.entryId === "string" &&
    row.entryId.length > 0 &&
    typeof row.count === "number" &&
    Number.isSafeInteger(row.count) &&
    row.count >= 0 &&
    (row.bestValue === null || (
      typeof row.bestValue === "number" &&
      Number.isFinite(row.bestValue) &&
      row.bestValue >= 0
    )) &&
    isTier(row.currentTier) &&
    sealIdsAreValid &&
    typeof row.scoreMilli === "number" &&
    Number.isSafeInteger(row.scoreMilli) &&
    row.scoreMilli >= 0;
  if (!rowIsStructurallyValid) {
    throw new Error("codex mastery locked progress row is malformed");
  }
  return codexMasteryRowToProgress(row);
}

function normalizedTierAchievedAt(
  value: unknown,
  currentTier: CodexMasteryTier,
): Partial<Record<CodexMasteryStage, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value) || currentTier === "none") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const currentTierIndex = tierIndex(currentTier);
  const timestamps: Partial<Record<CodexMasteryStage, string>> = {};
  for (const stage of CODEX_MASTERY_STAGES) {
    const timestamp = record[stage];
    if (tierIndex(stage) <= currentTierIndex && isIsoTimestamp(timestamp)) {
      timestamps[stage] = timestamp;
    }
  }
  return timestamps;
}

function normalizedDate(value: unknown): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? new Date(value.getTime())
    : null;
}

export function emptyCodexMasterySummary(): CodexMasterySummaryState {
  return {
    totalScoreMilli: 0,
    categoryScoreMilli: {
      equipment: 0,
      fish: 0,
      monster: 0,
      cooking: 0,
      life: 0,
      job: 0,
    },
    stageCounts: {
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
      diamond: 0,
      legendary: 0,
    },
    sealCount: 0,
    scoredCategoryCount: 0,
    scoreReachedAt: null,
    categoryScoreReachedAt: {
      equipment: null,
      fish: null,
      monster: null,
      cooking: null,
      life: null,
      job: null,
    },
  };
}

export function codexMasteryRowToProgress(
  row: PersistedProgressRow,
): CodexMasteryProgress {
  const currentTier = isTier(row.currentTier) ? row.currentTier : "none";
  return {
    category: row.category as CodexMasteryCategory,
    entryId: row.entryId,
    count: nonNegativeSafeInteger(row.count),
    bestValue: nonNegativeFiniteNumber(row.bestValue),
    currentTier,
    sealIds: normalizedSealIds(row.sealIds),
    tierAchievedAt: normalizedTierAchievedAt(row.tierAchievedAt, currentTier),
    scoreMilli: nonNegativeSafeInteger(row.scoreMilli),
  };
}

export function codexMasterySummaryRowToState(
  row: PersistedSummaryRow,
): CodexMasterySummaryState {
  return {
    totalScoreMilli: nonNegativeSafeInteger(row.totalScoreMilli),
    categoryScoreMilli: {
      equipment: nonNegativeSafeInteger(row.equipmentScoreMilli),
      fish: nonNegativeSafeInteger(row.fishScoreMilli),
      monster: nonNegativeSafeInteger(row.monsterScoreMilli),
      cooking: nonNegativeSafeInteger(row.cookingScoreMilli),
      life: nonNegativeSafeInteger(row.lifeScoreMilli),
      job: nonNegativeSafeInteger(row.jobScoreMilli),
    },
    stageCounts: {
      bronze: nonNegativeSafeInteger(row.bronzeCount),
      silver: nonNegativeSafeInteger(row.silverCount),
      gold: nonNegativeSafeInteger(row.goldCount),
      platinum: nonNegativeSafeInteger(row.platinumCount),
      diamond: nonNegativeSafeInteger(row.diamondCount),
      legendary: nonNegativeSafeInteger(row.legendaryCount),
    },
    sealCount: nonNegativeSafeInteger(row.sealCount),
    scoredCategoryCount: nonNegativeSafeInteger(row.scoredCategoryCount),
    scoreReachedAt: normalizedDate(row.scoreReachedAt),
    categoryScoreReachedAt: {
      equipment: normalizedDate(row.equipmentScoreReachedAt),
      fish: normalizedDate(row.fishScoreReachedAt),
      monster: normalizedDate(row.monsterScoreReachedAt),
      cooking: normalizedDate(row.cookingScoreReachedAt),
      life: normalizedDate(row.lifeScoreReachedAt),
      job: normalizedDate(row.jobScoreReachedAt),
    },
  };
}

function emptySummaryRow(userId: string, now: Date) {
  return {
    userId,
    totalScoreMilli: 0,
    equipmentScoreMilli: 0,
    fishScoreMilli: 0,
    monsterScoreMilli: 0,
    cookingScoreMilli: 0,
    lifeScoreMilli: 0,
    jobScoreMilli: 0,
    bronzeCount: 0,
    silverCount: 0,
    goldCount: 0,
    platinumCount: 0,
    diamondCount: 0,
    legendaryCount: 0,
    sealCount: 0,
    scoredCategoryCount: 0,
    scoreReachedAt: null,
    equipmentScoreReachedAt: null,
    fishScoreReachedAt: null,
    monsterScoreReachedAt: null,
    cookingScoreReachedAt: null,
    lifeScoreReachedAt: null,
    jobScoreReachedAt: null,
    updatedAt: now,
  };
}

function emptyProgressRow(
  userId: string,
  category: CodexMasteryCategory,
  entryId: string,
  now: Date,
) {
  return {
    userId,
    category,
    entryId,
    count: 0,
    bestValue: null,
    currentTier: "none",
    sealIds: [],
    tierAchievedAt: {},
    scoreMilli: 0,
    firstRecordedAt: now,
    updatedAt: now,
  };
}

async function selectSummary(
  executor: DbExecutor,
  userId: string,
  options: { forUpdate: boolean },
) {
  const query = executor
    .select()
    .from(codexMasterySummary)
    .where(eq(codexMasterySummary.userId, userId));
  const rows = options.forUpdate
    ? await query.for("update").limit(1)
    : await query.limit(1);
  return rows[0];
}

async function selectProgress(
  executor: DbTransactionExecutor,
  userId: string,
  category: CodexMasteryCategory,
  entryId: string,
  options: { forUpdate: boolean },
) {
  const query = executor
    .select()
    .from(codexMasteryProgress)
    .where(and(
      eq(codexMasteryProgress.userId, userId),
      eq(codexMasteryProgress.category, category),
      eq(codexMasteryProgress.entryId, entryId),
    ));
  const rows = options.forUpdate
    ? await query.for("update").limit(1)
    : await query.limit(1);
  return rows[0];
}

export async function readCodexMasteryProgressRows(
  executor: DbExecutor,
  userId: string,
): Promise<CodexMasteryProgress[]> {
  const rows = await executor
    .select()
    .from(codexMasteryProgress)
    .where(eq(codexMasteryProgress.userId, userId));
  return rows.map(codexMasteryRowToProgress);
}

export async function readCodexMasterySummary(
  executor: DbExecutor,
  userId: string,
): Promise<CodexMasterySummaryState> {
  const row = await selectSummary(executor, userId, { forUpdate: false });
  return row ? codexMasterySummaryRowToState(row) : emptyCodexMasterySummary();
}

export async function lockCodexMasteryState(
  executor: DbTransactionExecutor,
  userId: string,
  category: CodexMasteryCategory,
  entryId: string,
  now: Date,
): Promise<{
  summary: CodexMasterySummaryState;
  progress: CodexMasteryProgress;
}> {
  await executor
    .insert(codexMasterySummary)
    .values(emptySummaryRow(userId, now))
    .onConflictDoNothing();
  const summaryRow = await selectSummary(executor, userId, { forUpdate: true });
  if (!summaryRow) {
    throw new Error("codex mastery summary row could not be locked");
  }

  await executor
    .insert(codexMasteryProgress)
    .values(emptyProgressRow(userId, category, entryId, now))
    .onConflictDoNothing();
  const progressRow = await selectProgress(
    executor,
    userId,
    category,
    entryId,
    { forUpdate: true },
  );

  if (!progressRow) {
    throw new Error("codex mastery progress row could not be locked");
  }
  return {
    summary: codexMasterySummaryRowToState(summaryRow),
    progress: lockedCodexMasteryRowToProgress(progressRow),
  };
}

function masteryProgressIdentityKey(
  category: CodexMasteryCategory,
  entryId: string,
): string {
  return `${category}\u0000${entryId}`;
}

export async function lockCodexMasteryBatchState(
  executor: DbTransactionExecutor,
  userId: string,
  requestedEntries: readonly {
    category: CodexMasteryCategory;
    entryId: string;
  }[],
  now: Date,
): Promise<{
  summary: CodexMasterySummaryState;
  progress: CodexMasteryProgress[];
}> {
  const entries = [...new Map(requestedEntries.map((entry) => [
    masteryProgressIdentityKey(entry.category, entry.entryId),
    entry,
  ])).values()].sort((left, right) =>
    left.category.localeCompare(right.category) ||
    left.entryId.localeCompare(right.entryId)
  );
  if (entries.length === 0) {
    throw new Error("codex mastery batch requires at least one entry");
  }

  await executor
    .insert(codexMasterySummary)
    .values(emptySummaryRow(userId, now))
    .onConflictDoNothing();
  await executor
    .insert(codexMasteryProgress)
    .values(entries.map(({ category, entryId }) =>
      emptyProgressRow(userId, category, entryId, now)
    ))
    .onConflictDoNothing();

  const summaryRow = await selectSummary(executor, userId, { forUpdate: true });
  if (!summaryRow) {
    throw new Error("codex mastery summary row could not be locked");
  }

  const identityCondition = or(...entries.map(({ category, entryId }) =>
    and(
      eq(codexMasteryProgress.category, category),
      eq(codexMasteryProgress.entryId, entryId),
    )
  ));
  const progressRows = await executor
    .select()
    .from(codexMasteryProgress)
    .where(and(
      eq(codexMasteryProgress.userId, userId),
      identityCondition,
    ))
    .orderBy(
      asc(codexMasteryProgress.category),
      asc(codexMasteryProgress.entryId),
    )
    .for("update");
  const progress = progressRows.map(lockedCodexMasteryRowToProgress);
  const actualKeys = new Set(progress.map((row) =>
    masteryProgressIdentityKey(row.category, row.entryId)
  ));
  if (
    progress.length !== entries.length ||
    actualKeys.size !== entries.length ||
    entries.some((entry) =>
      !actualKeys.has(masteryProgressIdentityKey(entry.category, entry.entryId))
    )
  ) {
    throw new Error("codex mastery batch progress rows could not be locked");
  }
  return {
    summary: codexMasterySummaryRowToState(summaryRow),
    progress,
  };
}

export async function saveCodexMasteryState(
  executor: DbTransactionExecutor,
  input: {
    userId: string;
    summary: CodexMasterySummaryState;
    progress: CodexMasteryProgress;
  },
  now: Date,
): Promise<void> {
  const summary = codexMasterySummaryRowToState({
    totalScoreMilli: input.summary.totalScoreMilli,
    equipmentScoreMilli: input.summary.categoryScoreMilli.equipment,
    fishScoreMilli: input.summary.categoryScoreMilli.fish,
    monsterScoreMilli: input.summary.categoryScoreMilli.monster,
    cookingScoreMilli: input.summary.categoryScoreMilli.cooking,
    lifeScoreMilli: input.summary.categoryScoreMilli.life,
    jobScoreMilli: input.summary.categoryScoreMilli.job,
    bronzeCount: input.summary.stageCounts.bronze,
    silverCount: input.summary.stageCounts.silver,
    goldCount: input.summary.stageCounts.gold,
    platinumCount: input.summary.stageCounts.platinum,
    diamondCount: input.summary.stageCounts.diamond,
    legendaryCount: input.summary.stageCounts.legendary,
    sealCount: input.summary.sealCount,
    scoredCategoryCount: input.summary.scoredCategoryCount,
    scoreReachedAt: input.summary.scoreReachedAt,
    equipmentScoreReachedAt: input.summary.categoryScoreReachedAt.equipment,
    fishScoreReachedAt: input.summary.categoryScoreReachedAt.fish,
    monsterScoreReachedAt: input.summary.categoryScoreReachedAt.monster,
    cookingScoreReachedAt: input.summary.categoryScoreReachedAt.cooking,
    lifeScoreReachedAt: input.summary.categoryScoreReachedAt.life,
    jobScoreReachedAt: input.summary.categoryScoreReachedAt.job,
  });
  const progress = codexMasteryRowToProgress(input.progress);

  const savedSummary = await executor
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
      scoredCategoryCount: summary.scoredCategoryCount,
      scoreReachedAt: summary.scoreReachedAt,
      equipmentScoreReachedAt: summary.categoryScoreReachedAt.equipment,
      fishScoreReachedAt: summary.categoryScoreReachedAt.fish,
      monsterScoreReachedAt: summary.categoryScoreReachedAt.monster,
      cookingScoreReachedAt: summary.categoryScoreReachedAt.cooking,
      lifeScoreReachedAt: summary.categoryScoreReachedAt.life,
      jobScoreReachedAt: summary.categoryScoreReachedAt.job,
      updatedAt: now,
    })
    .where(eq(codexMasterySummary.userId, input.userId))
    .returning({ userId: codexMasterySummary.userId });
  if (savedSummary.length !== 1) {
    throw new Error("codex mastery summary row was not saved");
  }

  const savedProgress = await executor
    .update(codexMasteryProgress)
    .set({
      count: progress.count,
      bestValue: progress.bestValue,
      currentTier: progress.currentTier,
      sealIds: progress.sealIds,
      tierAchievedAt: progress.tierAchievedAt,
      scoreMilli: progress.scoreMilli,
      updatedAt: now,
    })
    .where(and(
      eq(codexMasteryProgress.userId, input.userId),
      eq(codexMasteryProgress.category, progress.category),
      eq(codexMasteryProgress.entryId, progress.entryId),
    ))
    .returning({ userId: codexMasteryProgress.userId });
  if (savedProgress.length !== 1) {
    throw new Error("codex mastery progress row was not saved");
  }
}

export async function saveCodexMasteryBatchState(
  executor: DbTransactionExecutor,
  input: {
    userId: string;
    summary: CodexMasterySummaryState;
    progress: readonly CodexMasteryProgress[];
  },
  now: Date,
): Promise<void> {
  const summary = codexMasterySummaryRowToState({
    totalScoreMilli: input.summary.totalScoreMilli,
    equipmentScoreMilli: input.summary.categoryScoreMilli.equipment,
    fishScoreMilli: input.summary.categoryScoreMilli.fish,
    monsterScoreMilli: input.summary.categoryScoreMilli.monster,
    cookingScoreMilli: input.summary.categoryScoreMilli.cooking,
    lifeScoreMilli: input.summary.categoryScoreMilli.life,
    jobScoreMilli: input.summary.categoryScoreMilli.job,
    bronzeCount: input.summary.stageCounts.bronze,
    silverCount: input.summary.stageCounts.silver,
    goldCount: input.summary.stageCounts.gold,
    platinumCount: input.summary.stageCounts.platinum,
    diamondCount: input.summary.stageCounts.diamond,
    legendaryCount: input.summary.stageCounts.legendary,
    sealCount: input.summary.sealCount,
    scoredCategoryCount: input.summary.scoredCategoryCount,
    scoreReachedAt: input.summary.scoreReachedAt,
    equipmentScoreReachedAt: input.summary.categoryScoreReachedAt.equipment,
    fishScoreReachedAt: input.summary.categoryScoreReachedAt.fish,
    monsterScoreReachedAt: input.summary.categoryScoreReachedAt.monster,
    cookingScoreReachedAt: input.summary.categoryScoreReachedAt.cooking,
    lifeScoreReachedAt: input.summary.categoryScoreReachedAt.life,
    jobScoreReachedAt: input.summary.categoryScoreReachedAt.job,
  });
  const savedSummary = await executor
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
      scoredCategoryCount: summary.scoredCategoryCount,
      scoreReachedAt: summary.scoreReachedAt,
      equipmentScoreReachedAt: summary.categoryScoreReachedAt.equipment,
      fishScoreReachedAt: summary.categoryScoreReachedAt.fish,
      monsterScoreReachedAt: summary.categoryScoreReachedAt.monster,
      cookingScoreReachedAt: summary.categoryScoreReachedAt.cooking,
      lifeScoreReachedAt: summary.categoryScoreReachedAt.life,
      jobScoreReachedAt: summary.categoryScoreReachedAt.job,
      updatedAt: now,
    })
    .where(eq(codexMasterySummary.userId, input.userId))
    .returning({ userId: codexMasterySummary.userId });
  if (savedSummary.length !== 1) {
    throw new Error("codex mastery summary row was not saved");
  }

  const progress = input.progress
    .map(codexMasteryRowToProgress)
    .sort((left, right) =>
      left.category.localeCompare(right.category) ||
      left.entryId.localeCompare(right.entryId)
    );
  if (progress.length === 0) return;
  const savedProgress = await executor
    .insert(codexMasteryProgress)
    .values(progress.map((row) => ({
      userId: input.userId,
      category: row.category,
      entryId: row.entryId,
      count: row.count,
      bestValue: row.bestValue,
      currentTier: row.currentTier,
      sealIds: row.sealIds,
      tierAchievedAt: row.tierAchievedAt,
      scoreMilli: row.scoreMilli,
      firstRecordedAt: now,
      updatedAt: now,
    })))
    .onConflictDoUpdate({
      target: [
        codexMasteryProgress.userId,
        codexMasteryProgress.category,
        codexMasteryProgress.entryId,
      ],
      set: {
        count: sql`excluded.count`,
        bestValue: sql`excluded.best_value`,
        currentTier: sql`excluded.current_tier`,
        sealIds: sql`excluded.seal_ids`,
        tierAchievedAt: sql`excluded.tier_achieved_at`,
        scoreMilli: sql`excluded.score_milli`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({
      userId: codexMasteryProgress.userId,
      category: codexMasteryProgress.category,
      entryId: codexMasteryProgress.entryId,
    });
  if (savedProgress.length !== progress.length) {
    throw new Error("codex mastery batch progress rows were not saved");
  }
}

export function createDrizzleCodexMasteryStore(
  executor: DbTransactionExecutor,
): CodexMasteryStore {
  return {
    lock: (input, now) => lockCodexMasteryState(
      executor,
      input.userId,
      input.category,
      input.entryId,
      now,
    ),
    save: (input, now) => saveCodexMasteryState(executor, input, now),
  };
}

export function createDrizzleCodexMasteryBatchStore(
  executor: DbTransactionExecutor,
): CodexMasteryBatchStore {
  return {
    lockBatch: (input, now) => lockCodexMasteryBatchState(
      executor,
      input.userId,
      input.entries,
      now,
    ),
    saveBatch: (input, now) =>
      saveCodexMasteryBatchState(executor, input, now),
  };
}
