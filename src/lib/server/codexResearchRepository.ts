import {
  and,
  desc,
  eq,
  gt,
  inArray,
  lte,
} from "drizzle-orm";
import {
  CODEX_RESEARCH_DIVERSITY_SCORE,
  CODEX_RESEARCH_MAX_SCORE,
  CODEX_RESEARCH_OBJECTIVE_COUNT,
  CODEX_RESEARCH_RECORD_SCORE,
  emptyCodexResearchProgress,
  kstCodexResearchSeasonWindow,
  validateCodexResearchSeasonDefinition,
  type CodexResearchDefinitionSnapshot,
  type CodexResearchProgress,
  type CodexResearchProgressState,
  type CodexResearchRepresentativeRecord,
  type CodexResearchSeasonStatus,
} from "@/adventure/data/v2/codexResearch";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import {
  codexResearchProgress,
  codexResearchSeasons,
} from "@/db/schema";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

export type CodexResearchSeasonState = {
  seasonId: string;
  themeId: string;
  definition: CodexResearchDefinitionSnapshot;
  startAt: Date;
  endAt: Date;
  status: CodexResearchSeasonStatus;
  settledAt: Date | null;
};

type PersistedSeasonRow = {
  seasonId: unknown;
  themeId: unknown;
  definitionSnapshot: unknown;
  startAt: unknown;
  endAt: unknown;
  status: unknown;
  settledAt: unknown;
};

type PersistedProgressRow = {
  score: unknown;
  objectiveProgress: unknown;
  objectiveCompletedCount: unknown;
  diversityScore: unknown;
  recordScore: unknown;
  scoreReachedAt: unknown;
  finalRank?: unknown;
  finalTier?: unknown;
  representativeRecord: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validStatus(value: unknown): value is CodexResearchSeasonStatus {
  return value === "scheduled" || value === "active" ||
    value === "settling" || value === "closed";
}

function cloneDefinition(
  value: CodexResearchDefinitionSnapshot,
): CodexResearchDefinitionSnapshot {
  return structuredClone(value);
}

export function codexResearchSeasonRowToState(
  row: PersistedSeasonRow,
): CodexResearchSeasonState {
  if (
    typeof row.seasonId !== "string" ||
    typeof row.themeId !== "string" ||
    !isObject(row.definitionSnapshot) ||
    !validDate(row.startAt) ||
    !validDate(row.endAt) ||
    !validStatus(row.status) ||
    (row.settledAt !== null && !validDate(row.settledAt))
  ) {
    throw new Error("codex research season row is malformed");
  }
  const definition = cloneDefinition(
    row.definitionSnapshot as CodexResearchDefinitionSnapshot,
  );
  const validation = validateCodexResearchSeasonDefinition(definition, {
    startAt: row.startAt,
    endAt: row.endAt,
  });
  if (
    validation ||
    definition.seasonId !== row.seasonId ||
    definition.themeId !== row.themeId
  ) {
    throw new Error("codex research season row is malformed");
  }
  return {
    seasonId: row.seasonId,
    themeId: row.themeId,
    definition,
    startAt: new Date(row.startAt.getTime()),
    endAt: new Date(row.endAt.getTime()),
    status: row.status,
    settledAt: row.settledAt ? new Date(row.settledAt.getTime()) : null,
  };
}

function validProgressState(value: unknown): value is CodexResearchProgressState {
  return isObject(value) &&
    isObject(value.objectives) &&
    isObject(value.diversityEntries) &&
    isObject(value.recordValues);
}

function validRepresentativeRecord(
  value: unknown,
): value is CodexResearchRepresentativeRecord | null {
  if (value === null) return true;
  return isObject(value) &&
    typeof value.trackId === "string" && value.trackId.trim().length > 0 &&
    typeof value.category === "string" && value.category.trim().length > 0 &&
    typeof value.entryId === "string" && value.entryId.trim().length > 0 &&
    typeof value.value === "number" && Number.isFinite(value.value) &&
    value.value >= 0 &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt));
}

function validFinalTier(value: unknown): value is CodexMasteryTrophyTier | null {
  return value === null ||
    (typeof value === "string" &&
      (CODEX_MASTERY_TROPHY_TIERS as readonly string[]).includes(value));
}

export function codexResearchProgressRowToState(
  row: PersistedProgressRow,
): CodexResearchProgress {
  const score = row.score;
  const completed = row.objectiveCompletedCount;
  const diversityScore = row.diversityScore;
  const recordScore = row.recordScore;
  if (
    !Number.isSafeInteger(score) || Number(score) < 0 ||
    Number(score) > CODEX_RESEARCH_MAX_SCORE ||
    !Number.isSafeInteger(completed) || Number(completed) < 0 ||
    Number(completed) > CODEX_RESEARCH_OBJECTIVE_COUNT ||
    !Number.isSafeInteger(diversityScore) || Number(diversityScore) < 0 ||
    Number(diversityScore) > CODEX_RESEARCH_DIVERSITY_SCORE ||
    !Number.isSafeInteger(recordScore) || Number(recordScore) < 0 ||
    Number(recordScore) > CODEX_RESEARCH_RECORD_SCORE ||
    Number(score) < Number(diversityScore) + Number(recordScore) ||
    Number(score) > Number(diversityScore) + Number(recordScore) + 12_000 ||
    !validProgressState(row.objectiveProgress) ||
    (row.scoreReachedAt !== null && !validDate(row.scoreReachedAt)) ||
    (Number(score) === 0) !== (row.scoreReachedAt === null) ||
    (row.finalRank !== undefined && row.finalRank !== null &&
      (!Number.isSafeInteger(row.finalRank) || Number(row.finalRank) < 1)) ||
    (row.finalTier !== undefined && !validFinalTier(row.finalTier)) ||
    !validRepresentativeRecord(row.representativeRecord)
  ) {
    throw new Error("codex research progress row is malformed");
  }
  return {
    score: Number(score),
    objectiveProgress: structuredClone(row.objectiveProgress),
    objectiveCompletedCount: Number(completed),
    diversityScore: Number(diversityScore),
    recordScore: Number(recordScore),
    scoreReachedAt: row.scoreReachedAt
      ? row.scoreReachedAt.toISOString()
      : null,
    representativeRecord: row.representativeRecord
      ? structuredClone(row.representativeRecord)
      : null,
  };
}

export async function scheduleCodexResearchSeason(
  executor: DbTransactionExecutor,
  definition: CodexResearchDefinitionSnapshot,
  now: Date = new Date(),
): Promise<CodexResearchSeasonState> {
  if (!validDate(now)) throw new Error("now must be a valid date");
  const window = kstCodexResearchSeasonWindow(definition.seasonId);
  const validation = validateCodexResearchSeasonDefinition(definition, window);
  if (validation) throw new Error(validation);
  const inserted = await executor
    .insert(codexResearchSeasons)
    .values({
      seasonId: definition.seasonId,
      themeId: definition.themeId,
      definitionSnapshot: cloneDefinition(definition),
      startAt: window.startAt,
      endAt: window.endAt,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ seasonId: codexResearchSeasons.seasonId });
  if (inserted.length !== 1) {
    throw new Error("codex research season already exists");
  }
  return {
    seasonId: definition.seasonId,
    themeId: definition.themeId,
    definition: cloneDefinition(definition),
    startAt: new Date(window.startAt.getTime()),
    endAt: new Date(window.endAt.getTime()),
    status: "scheduled",
    settledAt: null,
  };
}

export async function readCurrentCodexResearchSeason(
  executor: DbExecutor,
  now: Date = new Date(),
): Promise<CodexResearchSeasonState | null> {
  if (!validDate(now)) throw new Error("now must be a valid date");
  const rows = await executor
    .select()
    .from(codexResearchSeasons)
    .where(and(
      inArray(codexResearchSeasons.status, ["scheduled", "active"]),
      lte(codexResearchSeasons.startAt, now),
      gt(codexResearchSeasons.endAt, now),
    ))
    .orderBy(desc(codexResearchSeasons.startAt))
    .limit(2);
  if (rows.length > 1) {
    throw new Error("multiple current codex research seasons exist");
  }
  return rows[0] ? codexResearchSeasonRowToState(rows[0]) : null;
}

export async function readCodexResearchProgress(
  executor: DbExecutor,
  userId: string,
  seasonId: string,
): Promise<CodexResearchProgress | null> {
  const rows = await executor
    .select()
    .from(codexResearchProgress)
    .where(and(
      eq(codexResearchProgress.userId, userId),
      eq(codexResearchProgress.seasonId, seasonId),
    ))
    .limit(1);
  return rows[0] ? codexResearchProgressRowToState(rows[0]) : null;
}

export async function lockCodexResearchSeasonForSettlement(
  executor: DbTransactionExecutor,
  seasonId: string,
): Promise<CodexResearchSeasonState> {
  const rows = await executor
    .select()
    .from(codexResearchSeasons)
    .where(eq(codexResearchSeasons.seasonId, seasonId))
    .for("update")
    .limit(1);
  if (rows.length !== 1) {
    throw new Error("codex research season does not exist");
  }
  return codexResearchSeasonRowToState(rows[0]);
}

export type CodexResearchFinalResult = {
  userId: string;
  finalRank: number;
  finalTier: CodexMasteryTrophyTier | null;
};

export async function markCodexResearchSeasonSettling(
  executor: DbTransactionExecutor,
  seasonId: string,
  now: Date,
): Promise<void> {
  if (!validDate(now)) throw new Error("now must be a valid date");
  const rows = await executor
    .update(codexResearchSeasons)
    .set({ status: "settling", updatedAt: now })
    .where(and(
      eq(codexResearchSeasons.seasonId, seasonId),
      inArray(codexResearchSeasons.status, ["scheduled", "active", "settling"]),
    ))
    .returning({ seasonId: codexResearchSeasons.seasonId });
  if (rows.length !== 1) {
    throw new Error("codex research season was not marked settling");
  }
}

function validateFinalResults(
  results: readonly CodexResearchFinalResult[],
): void {
  const userIds = new Set<string>();
  const ranks = new Set<number>();
  for (const result of results) {
    if (
      typeof result.userId !== "string" ||
      result.userId.trim().length === 0 ||
      result.userId !== result.userId.trim() ||
      !Number.isSafeInteger(result.finalRank) ||
      result.finalRank < 1 ||
      !validFinalTier(result.finalTier) ||
      userIds.has(result.userId) ||
      ranks.has(result.finalRank)
    ) {
      throw new Error("codex research final results are invalid");
    }
    userIds.add(result.userId);
    ranks.add(result.finalRank);
  }
}

export async function writeCodexResearchFinalResults(
  executor: DbTransactionExecutor,
  seasonId: string,
  results: readonly CodexResearchFinalResult[],
  now: Date,
): Promise<void> {
  if (!validDate(now)) throw new Error("now must be a valid date");
  validateFinalResults(results);
  await executor
    .update(codexResearchProgress)
    .set({ finalRank: null, finalTier: null, updatedAt: now })
    .where(eq(codexResearchProgress.seasonId, seasonId))
    .returning({ userId: codexResearchProgress.userId });
  for (const result of results) {
    const rows = await executor
      .update(codexResearchProgress)
      .set({
        finalRank: result.finalRank,
        finalTier: result.finalTier,
        updatedAt: now,
      })
      .where(and(
        eq(codexResearchProgress.userId, result.userId),
        eq(codexResearchProgress.seasonId, seasonId),
      ))
      .returning({ userId: codexResearchProgress.userId });
    if (rows.length !== 1) {
      throw new Error("codex research final result row was not saved");
    }
  }
}

export async function closeCodexResearchSeason(
  executor: DbTransactionExecutor,
  seasonId: string,
  settledAt: Date,
): Promise<void> {
  if (!validDate(settledAt)) throw new Error("settledAt must be a valid date");
  const rows = await executor
    .update(codexResearchSeasons)
    .set({ status: "closed", settledAt, updatedAt: settledAt })
    .where(and(
      eq(codexResearchSeasons.seasonId, seasonId),
      eq(codexResearchSeasons.status, "settling"),
    ))
    .returning({ seasonId: codexResearchSeasons.seasonId });
  if (rows.length !== 1) {
    throw new Error("codex research season was not closed");
  }
}

export async function lockCodexResearchProgress(
  executor: DbTransactionExecutor,
  userId: string,
  seasonId: string,
  now: Date,
): Promise<CodexResearchProgress> {
  const empty = emptyCodexResearchProgress();
  await executor
    .insert(codexResearchProgress)
    .values({
      userId,
      seasonId,
      ...empty,
      scoreReachedAt: null,
      representativeRecord: null,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const rows = await executor
    .select()
    .from(codexResearchProgress)
    .where(and(
      eq(codexResearchProgress.userId, userId),
      eq(codexResearchProgress.seasonId, seasonId),
    ))
    .for("update")
    .limit(1);
  if (rows.length !== 1) {
    throw new Error("codex research progress row could not be locked");
  }
  return codexResearchProgressRowToState(rows[0]);
}

export async function saveCodexResearchProgress(
  executor: DbTransactionExecutor,
  userId: string,
  seasonId: string,
  progress: CodexResearchProgress,
  now: Date,
): Promise<void> {
  const validated = codexResearchProgressRowToState({
    ...progress,
    scoreReachedAt: progress.scoreReachedAt
      ? new Date(progress.scoreReachedAt)
      : null,
    finalRank: null,
    finalTier: null,
  });
  const saved = await executor
    .update(codexResearchProgress)
    .set({
      score: validated.score,
      objectiveProgress: validated.objectiveProgress,
      objectiveCompletedCount: validated.objectiveCompletedCount,
      diversityScore: validated.diversityScore,
      recordScore: validated.recordScore,
      scoreReachedAt: validated.scoreReachedAt
        ? new Date(validated.scoreReachedAt)
        : null,
      representativeRecord: validated.representativeRecord,
      updatedAt: now,
    })
    .where(and(
      eq(codexResearchProgress.userId, userId),
      eq(codexResearchProgress.seasonId, seasonId),
    ))
    .returning({ userId: codexResearchProgress.userId });
  if (saved.length !== 1) {
    throw new Error("codex research progress row was not saved");
  }
}

export async function activateCodexResearchSeason(
  executor: DbTransactionExecutor,
  seasonId: string,
  now: Date,
): Promise<void> {
  const activated = await executor
    .update(codexResearchSeasons)
    .set({ status: "active", updatedAt: now })
    .where(and(
      eq(codexResearchSeasons.seasonId, seasonId),
      eq(codexResearchSeasons.status, "scheduled"),
    ))
    .returning({ seasonId: codexResearchSeasons.seasonId });
  if (activated.length === 1) return;

  const rows = await executor
    .select()
    .from(codexResearchSeasons)
    .where(eq(codexResearchSeasons.seasonId, seasonId))
    .limit(1);
  if (rows[0] && codexResearchSeasonRowToState(rows[0]).status === "active") {
    return;
  }
  throw new Error("codex research season was not activated");
}
