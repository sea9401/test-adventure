import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import {
  codexResearchTierFor,
  type CodexResearchSeasonTrophyHistory,
  type CodexResearchSeasonTrophyMetadata,
} from "@/adventure/data/v2/codexResearchRanking";
import {
  CODEX_MASTERY_CATEGORIES,
} from "@/adventure/data/v2/codexMasteryTypes";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  isCodexTrophyId,
  type CodexMasteryTrophyTier,
  type CodexResearchTrophyId,
} from "@/adventure/data/v2/codexMasteryTrophies";
import type { CodexResearchRepresentativeRecord } from "@/adventure/data/v2/codexResearch";
import { codexResearchProgress, codexTrophyHistory } from "@/db/schema";
import {
  codexResearchProgressRowToState,
  lockCodexResearchSeasonForSettlement,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import type { DbExecutor, DbTransactionExecutor } from "./savesKv";

export type CodexResearchFinalist = {
  userId: string;
  score: number;
  objectiveCompletedCount: number;
  diversityScore: number;
  recordScore: number;
  finalRank: number;
  finalTier: CodexMasteryTrophyTier;
  representativeRecord: CodexResearchRepresentativeRecord | null;
};

export type CodexResearchTrophyAwardRuntime<Executor> = {
  lockSeason(executor: Executor, seasonId: string): Promise<CodexResearchSeasonState>;
  readFinalists(executor: Executor, seasonId: string): Promise<CodexResearchFinalist[]>;
  writeHistory(
    executor: Executor,
    userId: string,
    history: CodexResearchSeasonTrophyHistory,
  ): Promise<"created" | "existing">;
};

type PersistedResearchTrophyRow = {
  trophyId: unknown;
  trophyKind: unknown;
  currentTier: unknown;
  tierAchievedAt: unknown;
  catalogVersion: unknown;
  seasonMetadata: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTier(value: unknown): value is CodexMasteryTrophyTier {
  return typeof value === "string" &&
    (CODEX_MASTERY_TROPHY_TIERS as readonly string[]).includes(value);
}

function isStrictIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function parseRepresentativeRecord(
  value: unknown,
): CodexResearchRepresentativeRecord | null | undefined {
  if (value === null) return null;
  if (
    !isObject(value) ||
    typeof value.trackId !== "string" || value.trackId.trim() === "" ||
    typeof value.category !== "string" ||
    !(CODEX_MASTERY_CATEGORIES as readonly string[]).includes(value.category) ||
    typeof value.entryId !== "string" || value.entryId.trim() === "" ||
    typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 ||
    !isStrictIsoTimestamp(value.recordedAt)
  ) return undefined;
  return {
    trackId: value.trackId,
    category: value.category as CodexResearchRepresentativeRecord["category"],
    entryId: value.entryId,
    value: value.value,
    recordedAt: value.recordedAt,
  };
}

function malformed(): never {
  throw new Error("research trophy history row is malformed");
}

export function codexResearchTrophyHistoryRowToState(
  row: PersistedResearchTrophyRow,
): CodexResearchSeasonTrophyHistory {
  if (
    typeof row.trophyId !== "string" ||
    !isCodexTrophyId(row.trophyId) ||
    !row.trophyId.startsWith("research:") ||
    row.trophyKind !== "research_season" ||
    !isTier(row.currentTier) ||
    !Number.isSafeInteger(row.catalogVersion) || Number(row.catalogVersion) < 1 ||
    !isObject(row.tierAchievedAt) ||
    !isObject(row.seasonMetadata)
  ) malformed();

  const metadata = row.seasonMetadata;
  const representativeRecord = parseRepresentativeRecord(metadata.representativeRecord);
  if (
    typeof metadata.seasonId !== "string" ||
    row.trophyId !== `research:${metadata.seasonId}` ||
    typeof metadata.themeId !== "string" || metadata.themeId.trim() === "" ||
    typeof metadata.themeName !== "string" || metadata.themeName.trim() === "" ||
    !isIntegerBetween(metadata.finalRank, 1, Number.MAX_SAFE_INTEGER) ||
    !isIntegerBetween(metadata.score, 0, 20_000) ||
    !isIntegerBetween(metadata.objectiveCompletedCount, 0, 18) ||
    !isIntegerBetween(metadata.objectiveScore, 0, 12_000) ||
    !isIntegerBetween(metadata.diversityScore, 0, 5_000) ||
    !isIntegerBetween(metadata.recordScore, 0, 3_000) ||
    metadata.score !== metadata.objectiveScore + metadata.diversityScore + metadata.recordScore ||
    representativeRecord === undefined ||
    !isStrictIsoTimestamp(metadata.settledAt) ||
    typeof metadata.firstPlaceEngraving !== "boolean" ||
    metadata.firstPlaceEngraving !== (metadata.finalRank === 1) ||
    codexResearchTierFor(metadata.score, metadata.finalRank) !== row.currentTier
  ) malformed();

  const times = row.tierAchievedAt;
  if (
    Object.keys(times).some((key) => key !== row.currentTier) ||
    times[row.currentTier] !== metadata.settledAt
  ) malformed();

  const seasonMetadata: CodexResearchSeasonTrophyMetadata = {
    seasonId: metadata.seasonId,
    themeId: metadata.themeId,
    themeName: metadata.themeName,
    finalRank: metadata.finalRank,
    score: metadata.score,
    objectiveCompletedCount: metadata.objectiveCompletedCount,
    objectiveScore: metadata.objectiveScore,
    diversityScore: metadata.diversityScore,
    recordScore: metadata.recordScore,
    representativeRecord,
    settledAt: metadata.settledAt,
    firstPlaceEngraving: metadata.firstPlaceEngraving,
  };
  return {
    trophyId: row.trophyId as CodexResearchTrophyId,
    kind: "research_season",
    currentTier: row.currentTier,
    tierAchievedAt: { [row.currentTier]: metadata.settledAt },
    catalogVersion: Number(row.catalogVersion),
    seasonMetadata,
  };
}

function validateFinalist(finalist: CodexResearchFinalist): void {
  const objectiveScore = finalist.score - finalist.diversityScore - finalist.recordScore;
  if (
    typeof finalist.userId !== "string" || finalist.userId.trim() === "" ||
    finalist.userId !== finalist.userId.trim() ||
    !isIntegerBetween(finalist.finalRank, 1, Number.MAX_SAFE_INTEGER) ||
    !isIntegerBetween(finalist.score, 0, 20_000) ||
    !isIntegerBetween(finalist.objectiveCompletedCount, 0, 18) ||
    !isIntegerBetween(finalist.diversityScore, 0, 5_000) ||
    !isIntegerBetween(finalist.recordScore, 0, 3_000) ||
    objectiveScore < 0 || objectiveScore > 12_000 ||
    !isTier(finalist.finalTier) ||
    codexResearchTierFor(finalist.score, finalist.finalRank) !== finalist.finalTier ||
    parseRepresentativeRecord(finalist.representativeRecord) === undefined
  ) {
    throw new Error("codex research finalists are invalid");
  }
}

export function createCodexResearchTrophyAwarder<Executor>(
  runtime: CodexResearchTrophyAwardRuntime<Executor>,
) {
  return async (executor: Executor, seasonId: string) => {
    const season = await runtime.lockSeason(executor, seasonId);
    if (
      season.seasonId !== seasonId ||
      season.status !== "closed" ||
      !season.settledAt
    ) {
      throw new Error("codex research season is not closed");
    }
    const finalists = await runtime.readFinalists(executor, seasonId);
    const userIds = new Set<string>();
    const ranks = new Set<number>();
    let createdCount = 0;
    let existingCount = 0;
    for (const finalist of finalists) {
      validateFinalist(finalist);
      if (userIds.has(finalist.userId) || ranks.has(finalist.finalRank)) {
        throw new Error("codex research finalists are invalid");
      }
      userIds.add(finalist.userId);
      ranks.add(finalist.finalRank);
      const settledAt = season.settledAt.toISOString();
      const history = codexResearchTrophyHistoryRowToState({
        trophyId: `research:${season.seasonId}`,
        trophyKind: "research_season",
        currentTier: finalist.finalTier,
        tierAchievedAt: { [finalist.finalTier]: settledAt },
        catalogVersion: season.definition.version,
        seasonMetadata: {
          seasonId: season.seasonId,
          themeId: season.themeId,
          themeName: season.definition.themeName,
          finalRank: finalist.finalRank,
          score: finalist.score,
          objectiveCompletedCount: finalist.objectiveCompletedCount,
          objectiveScore: finalist.score - finalist.diversityScore - finalist.recordScore,
          diversityScore: finalist.diversityScore,
          recordScore: finalist.recordScore,
          representativeRecord: finalist.representativeRecord,
          settledAt,
          firstPlaceEngraving: finalist.finalRank === 1,
        },
      });
      const result = await runtime.writeHistory(
        executor,
        finalist.userId,
        history,
      );
      if (result === "created") createdCount += 1;
      else existingCount += 1;
    }
    return {
      status: "awarded" as const,
      seasonId,
      eligibleCount: finalists.length,
      createdCount,
      existingCount,
    };
  };
}

export async function readCodexResearchFinalists(
  executor: DbTransactionExecutor,
  seasonId: string,
): Promise<CodexResearchFinalist[]> {
  const rows = await executor
    .select()
    .from(codexResearchProgress)
    .where(and(
      eq(codexResearchProgress.seasonId, seasonId),
      isNotNull(codexResearchProgress.finalRank),
      isNotNull(codexResearchProgress.finalTier),
    ))
    .orderBy(asc(codexResearchProgress.finalRank));
  return rows.map((row) => {
    const progress = codexResearchProgressRowToState(row);
    if (!row.finalRank || !isTier(row.finalTier)) {
      throw new Error("codex research finalists are invalid");
    }
    const finalist: CodexResearchFinalist = {
      userId: row.userId,
      score: progress.score,
      objectiveCompletedCount: progress.objectiveCompletedCount,
      diversityScore: progress.diversityScore,
      recordScore: progress.recordScore,
      finalRank: row.finalRank,
      finalTier: row.finalTier,
      representativeRecord: progress.representativeRecord,
    };
    validateFinalist(finalist);
    return finalist;
  });
}

async function writeCodexResearchTrophyHistory(
  executor: DbTransactionExecutor,
  userId: string,
  history: CodexResearchSeasonTrophyHistory,
): Promise<"created" | "existing"> {
  const inserted = await executor
    .insert(codexTrophyHistory)
    .values({
      userId,
      trophyId: history.trophyId,
      trophyKind: history.kind,
      currentTier: history.currentTier,
      tierAchievedAt: history.tierAchievedAt,
      catalogVersion: history.catalogVersion,
      seasonMetadata: history.seasonMetadata,
      updatedAt: new Date(history.seasonMetadata.settledAt),
    })
    .onConflictDoNothing()
    .returning({ trophyId: codexTrophyHistory.trophyId });
  if (inserted.length === 1) return "created";

  const rows = await executor
    .select({
      trophyId: codexTrophyHistory.trophyId,
      trophyKind: codexTrophyHistory.trophyKind,
      currentTier: codexTrophyHistory.currentTier,
      tierAchievedAt: codexTrophyHistory.tierAchievedAt,
      catalogVersion: codexTrophyHistory.catalogVersion,
      seasonMetadata: codexTrophyHistory.seasonMetadata,
    })
    .from(codexTrophyHistory)
    .where(and(
      eq(codexTrophyHistory.userId, userId),
      eq(codexTrophyHistory.trophyId, history.trophyId),
    ))
    .limit(1);
  if (
    rows.length !== 1 ||
    JSON.stringify(codexResearchTrophyHistoryRowToState(rows[0])) !== JSON.stringify(history)
  ) {
    throw new Error("codex research trophy result conflicts with stored history");
  }
  return "existing";
}

export async function readCodexResearchTrophyHistory(
  executor: DbExecutor,
  userId: string,
): Promise<CodexResearchSeasonTrophyHistory[]> {
  const rows = await executor
    .select({
      trophyId: codexTrophyHistory.trophyId,
      trophyKind: codexTrophyHistory.trophyKind,
      currentTier: codexTrophyHistory.currentTier,
      tierAchievedAt: codexTrophyHistory.tierAchievedAt,
      catalogVersion: codexTrophyHistory.catalogVersion,
      seasonMetadata: codexTrophyHistory.seasonMetadata,
    })
    .from(codexTrophyHistory)
    .where(and(
      eq(codexTrophyHistory.userId, userId),
      eq(codexTrophyHistory.trophyKind, "research_season"),
    ))
    .orderBy(desc(codexTrophyHistory.updatedAt));
  return rows.map(codexResearchTrophyHistoryRowToState);
}

const DRIZZLE_RUNTIME: CodexResearchTrophyAwardRuntime<DbTransactionExecutor> = {
  lockSeason: lockCodexResearchSeasonForSettlement,
  readFinalists: readCodexResearchFinalists,
  writeHistory: writeCodexResearchTrophyHistory,
};

export const awardCodexResearchSeasonTrophies = createCodexResearchTrophyAwarder(
  DRIZZLE_RUNTIME,
);
