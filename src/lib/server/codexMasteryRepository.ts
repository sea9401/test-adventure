import { and, eq } from "drizzle-orm";
import {
  CODEX_MASTERY_STAGES,
  type CodexMasteryCategory,
  type CodexMasteryProgress,
  type CodexMasteryStage,
  type CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import { codexMasteryProgress, codexMasterySummary } from "@/db/schema";
import type { DbExecutor } from "./savesKv";

type CodexMasterySummaryStage = Exclude<CodexMasteryStage, "discovered">;

export type CodexMasterySummaryState = {
  totalScoreMilli: number;
  categoryScoreMilli: Record<CodexMasteryCategory, number>;
  stageCounts: Record<CodexMasterySummaryStage, number>;
  sealCount: number;
  scoreReachedAt: Date | null;
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
  scoreReachedAt: unknown;
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
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
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
    scoreReachedAt: null,
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
    scoreReachedAt: normalizedDate(row.scoreReachedAt),
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
    scoreReachedAt: null,
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
  executor: DbExecutor,
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

export async function lockCodexMasteryState(
  executor: DbExecutor,
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
    progress: codexMasteryRowToProgress(progressRow),
  };
}

export async function saveCodexMasteryState(
  executor: DbExecutor,
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
    scoreReachedAt: input.summary.scoreReachedAt,
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
      scoreReachedAt: summary.scoreReachedAt,
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

export function createDrizzleCodexMasteryStore(
  executor: DbExecutor,
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
