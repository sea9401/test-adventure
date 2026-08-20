import { sql, type SQL } from "drizzle-orm";
import {
  validateCodexResearchSeasonDefinition,
} from "@/adventure/data/v2/codexResearch";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import { codexResearchTierFor } from "@/adventure/data/v2/codexResearchRanking";
import {
  closeCodexResearchSeason,
  lockCodexResearchSeasonForSettlement,
  markCodexResearchSeasonSettling,
  writeCodexResearchFinalResults,
  type CodexResearchFinalResult,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import type { DbTransactionExecutor } from "./savesKv";

export type CodexResearchSettlementCandidate = {
  userId: string;
  finalRank: number;
  score: number;
  objectiveCompletedCount: number;
  diversityScore: number;
  recordScore: number;
};

export type CodexResearchSettlementRuntime<Executor> = {
  lockSeason(executor: Executor, seasonId: string): Promise<CodexResearchSeasonState>;
  markSettling(executor: Executor, seasonId: string, now: Date): Promise<void>;
  readCandidates(
    executor: Executor,
    seasonId: string,
    adminEmails: readonly string[],
    now: Date,
  ): Promise<CodexResearchSettlementCandidate[]>;
  writeResults(
    executor: Executor,
    seasonId: string,
    results: readonly CodexResearchFinalResult[],
    now: Date,
  ): Promise<void>;
  closeSeason(executor: Executor, seasonId: string, now: Date): Promise<void>;
};

export type CodexResearchSettlementResult =
  | { status: "already_closed"; seasonId: string }
  | {
      status: "settled";
      seasonId: string;
      participantCount: number;
      tierCounts: Record<CodexMasteryTrophyTier, number>;
    };

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validateCandidates(
  candidates: readonly CodexResearchSettlementCandidate[],
): void {
  const userIds = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    const objectiveScore = candidate.score -
      candidate.diversityScore -
      candidate.recordScore;
    if (
      typeof candidate.userId !== "string" ||
      candidate.userId.trim().length === 0 ||
      candidate.userId !== candidate.userId.trim() ||
      userIds.has(candidate.userId) ||
      candidate.finalRank !== index + 1 ||
      !Number.isSafeInteger(candidate.score) ||
      candidate.score <= 0 ||
      candidate.score > 20_000 ||
      !Number.isSafeInteger(candidate.objectiveCompletedCount) ||
      candidate.objectiveCompletedCount < 0 ||
      candidate.objectiveCompletedCount > 18 ||
      !Number.isSafeInteger(candidate.diversityScore) ||
      candidate.diversityScore < 0 ||
      candidate.diversityScore > 5_000 ||
      !Number.isSafeInteger(candidate.recordScore) ||
      candidate.recordScore < 0 ||
      candidate.recordScore > 3_000 ||
      objectiveScore < 0 ||
      objectiveScore > 12_000
    ) {
      throw new Error("codex research settlement candidates are invalid");
    }
    userIds.add(candidate.userId);
  }
}

export function createCodexResearchSettlement<Executor>(
  runtime: CodexResearchSettlementRuntime<Executor>,
) {
  return async (
    executor: Executor,
    input: {
      seasonId: string;
      now: Date;
      adminEmails: readonly string[];
    },
  ): Promise<CodexResearchSettlementResult> => {
    if (!validDate(input.now)) throw new Error("now must be a valid date");
    const season = await runtime.lockSeason(executor, input.seasonId);
    if (season.seasonId !== input.seasonId) {
      throw new Error("codex research season identity is inconsistent");
    }
    if (season.status === "closed") {
      return { status: "already_closed", seasonId: season.seasonId };
    }
    if (season.endAt.getTime() > input.now.getTime()) {
      throw new Error("codex research season has not ended");
    }
    if (
      season.status !== "scheduled" &&
      season.status !== "active" &&
      season.status !== "settling"
    ) {
      throw new Error("codex research season cannot be settled");
    }
    const definitionError = validateCodexResearchSeasonDefinition(
      season.definition,
      { startAt: season.startAt, endAt: season.endAt },
    );
    if (definitionError) throw new Error(definitionError);

    await runtime.markSettling(executor, season.seasonId, input.now);
    const candidates = await runtime.readCandidates(
      executor,
      season.seasonId,
      input.adminEmails,
      input.now,
    );
    validateCandidates(candidates);
    const results = candidates.map((candidate): CodexResearchFinalResult => ({
      userId: candidate.userId,
      finalRank: candidate.finalRank,
      finalTier: codexResearchTierFor(candidate.score, candidate.finalRank),
    }));
    const tierCounts = Object.fromEntries(
      CODEX_MASTERY_TROPHY_TIERS.map((tier) => [tier, 0]),
    ) as Record<CodexMasteryTrophyTier, number>;
    for (const result of results) {
      if (result.finalTier) tierCounts[result.finalTier] += 1;
    }
    await runtime.writeResults(
      executor,
      season.seasonId,
      results,
      input.now,
    );
    await runtime.closeSeason(executor, season.seasonId, input.now);
    return {
      status: "settled",
      seasonId: season.seasonId,
      participantCount: candidates.length,
      tierCounts,
    };
  };
}

type RawCandidate = {
  user_id: unknown;
  final_rank: unknown;
  score: unknown;
  objective_completed_count: unknown;
  diversity_score: unknown;
  record_score: unknown;
};

function integer(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("codex research settlement candidates are invalid");
  }
  return parsed;
}

function excludeAdminEmails(adminEmails: readonly string[]): SQL {
  const normalized = [...new Set(
    adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
  )];
  if (normalized.length === 0) return sql``;
  const list = sql.join(normalized.map((email) => sql`${email}`), sql`, `);
  return sql`AND LOWER(u.email) NOT IN (${list})`;
}

export async function readCodexResearchSettlementCandidates(
  executor: DbTransactionExecutor,
  seasonId: string,
  adminEmails: readonly string[],
  now: Date,
): Promise<CodexResearchSettlementCandidate[]> {
  const result = await executor.execute(sql`
    WITH eligible AS (
      SELECT
        rp.user_id,
        rp.score,
        rp.objective_completed_count,
        rp.diversity_score,
        rp.record_score,
        rp.score_reached_at
      FROM codex_research_progress rp
      INNER JOIN users u ON u.id = rp.user_id
      LEFT JOIN saves_kv p
        ON p.user_id = u.id AND p.key = 'character-profile.v2'
      WHERE rp.season_id = ${seasonId}
        AND rp.score > 0
        AND COALESCE(
          NULLIF(btrim(u.game_name), ''),
          NULLIF(btrim(p.value->>'name'), '')
        ) IS NOT NULL
        AND (u.banned_until IS NULL OR u.banned_until <= ${now})
        ${excludeAdminEmails(adminEmails)}
    )
    SELECT
      user_id,
      ROW_NUMBER() OVER (
        ORDER BY
          score DESC,
          objective_completed_count DESC,
          diversity_score DESC,
          record_score DESC,
          score_reached_at ASC NULLS LAST,
          user_id ASC
      )::int AS final_rank,
      score,
      objective_completed_count,
      diversity_score,
      record_score
    FROM eligible
    ORDER BY final_rank ASC
  `);
  const candidates = (result.rows as unknown as RawCandidate[]).map((row) => {
    if (typeof row.user_id !== "string") {
      throw new Error("codex research settlement candidates are invalid");
    }
    return {
      userId: row.user_id,
      finalRank: integer(row.final_rank),
      score: integer(row.score),
      objectiveCompletedCount: integer(row.objective_completed_count),
      diversityScore: integer(row.diversity_score),
      recordScore: integer(row.record_score),
    };
  });
  validateCandidates(candidates);
  return candidates;
}

const DRIZZLE_RUNTIME: CodexResearchSettlementRuntime<DbTransactionExecutor> = {
  lockSeason: lockCodexResearchSeasonForSettlement,
  markSettling: markCodexResearchSeasonSettling,
  readCandidates: readCodexResearchSettlementCandidates,
  writeResults: writeCodexResearchFinalResults,
  closeSeason: closeCodexResearchSeason,
};

export const settleCodexResearchSeason = createCodexResearchSettlement(
  DRIZZLE_RUNTIME,
);
