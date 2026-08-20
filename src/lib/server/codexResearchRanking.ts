import { sql, type SQL } from "drizzle-orm";
import {
  codexResearchTierFor,
  type CodexResearchRankingRow,
} from "@/adventure/data/v2/codexResearchRanking";
import { isStoredAvatarId, type Avatar } from "@/adventure/profile/avatars";
import { museunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import {
  readCurrentCodexResearchSeason,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import type { DbExecutor } from "./savesKv";

const DEFAULT_TOP_LIMIT = 50;
const MAX_TOP_LIMIT = 100;
const DEFAULT_NEIGHBOR_RADIUS = 2;
const MAX_NEIGHBOR_RADIUS = 5;

export type CodexResearchRankingExecutor = Pick<DbExecutor, "execute">;

type RawRankingRow = {
  user_id: unknown;
  name: unknown;
  avatar: unknown;
  character_save: unknown;
  rank: unknown;
  is_top: unknown;
  score: unknown;
  objective_completed_count: unknown;
  diversity_score: unknown;
  record_score: unknown;
};

type ActiveRanking = {
  status: "active";
  seasonId: string;
  themeId: string;
  themeName: string;
  startAt: string;
  endAt: string;
  list: CodexResearchRankingRow[];
  nearby: CodexResearchRankingRow[];
  me: CodexResearchRankingRow | null;
};

export type CodexResearchRankingReadResult =
  | { status: "no_season" }
  | ActiveRanking;

function boundedInteger(value: number | undefined, fallback: number, max: number) {
  if (!Number.isSafeInteger(value) || (value ?? 0) < 0) return fallback;
  return Math.min(value ?? fallback, max);
}

function nonNegativeSafeInteger(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("invalid monthly codex ranking row");
  }
  return parsed;
}

function positiveSafeInteger(value: unknown): number {
  const parsed = nonNegativeSafeInteger(value);
  if (parsed === 0) throw new Error("invalid monthly codex ranking row");
  return parsed;
}

function rankingAvatar(raw: unknown): Avatar {
  if (raw === "male") return "male1";
  if (raw === "female") return "female1";
  return isStoredAvatarId(raw) ? raw : "male1";
}

function normalizeRow(
  raw: RawRankingRow,
  viewerUserId: string,
  now: Date,
): { userId: string; isTop: boolean; row: CodexResearchRankingRow } {
  if (
    typeof raw.user_id !== "string" ||
    typeof raw.name !== "string" ||
    raw.name.trim() === "" ||
    raw.is_top !== true && raw.is_top !== false
  ) {
    throw new Error("invalid monthly codex ranking row");
  }
  const rank = positiveSafeInteger(raw.rank);
  const score = nonNegativeSafeInteger(raw.score);
  const objectiveCompletedCount = nonNegativeSafeInteger(
    raw.objective_completed_count,
  );
  const diversityScore = nonNegativeSafeInteger(raw.diversity_score);
  const recordScore = nonNegativeSafeInteger(raw.record_score);
  const objectiveScore = score - diversityScore - recordScore;
  if (
    score > 20_000 ||
    objectiveCompletedCount > 18 ||
    diversityScore > 5_000 ||
    recordScore > 3_000 ||
    objectiveScore < 0 ||
    objectiveScore > 12_000
  ) {
    throw new Error("invalid monthly codex ranking row");
  }
  const character = raw.character_save &&
      typeof raw.character_save === "object" &&
      !Array.isArray(raw.character_save)
    ? raw.character_save as {
        museunCosmetics?: unknown;
        arenaChampionshipBadges?: unknown;
      }
    : undefined;
  const cosmetics = museunCosmeticAppearance(
    character?.museunCosmetics,
    now.getTime(),
    character?.arenaChampionshipBadges,
  );
  return {
    userId: raw.user_id,
    isTop: raw.is_top,
    row: {
      rank,
      name: raw.name.trim(),
      avatar: rankingAvatar(raw.avatar),
      score,
      objectiveCompletedCount,
      objectiveScore,
      diversityScore,
      recordScore,
      provisionalTier: codexResearchTierFor(score, rank),
      mine: raw.user_id === viewerUserId,
      profileBorder: cosmetics.profileBorder,
      chatNameEffect: cosmetics.chatNameEffect,
    },
  };
}

function excludeAdminEmails(adminEmails: readonly string[]): SQL {
  const normalized = [...new Set(
    adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
  )];
  if (normalized.length === 0) return sql``;
  const list = sql.join(normalized.map((email) => sql`${email}`), sql`, `);
  return sql`AND LOWER(u.email) NOT IN (${list})`;
}

export async function readCodexResearchRankingForSeason(
  executor: CodexResearchRankingExecutor,
  season: CodexResearchSeasonState,
  input: {
    viewerUserId: string;
    adminEmails: readonly string[];
    now: Date;
    topLimit?: number;
    neighborRadius?: number;
  },
): Promise<ActiveRanking> {
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new Error("now must be a valid date");
  }
  const topLimit = boundedInteger(
    input.topLimit,
    DEFAULT_TOP_LIMIT,
    MAX_TOP_LIMIT,
  );
  const neighborRadius = boundedInteger(
    input.neighborRadius,
    DEFAULT_NEIGHBOR_RADIUS,
    MAX_NEIGHBOR_RADIUS,
  );
  const result = await executor.execute(sql`
    WITH eligible AS (
      SELECT
        u.id AS user_id,
        COALESCE(
          NULLIF(btrim(u.game_name), ''),
          NULLIF(btrim(p.value->>'name'), '')
        ) AS name,
        p.value->>'gender' AS avatar,
        c.value AS character_save,
        rp.score,
        rp.objective_completed_count,
        rp.diversity_score,
        rp.record_score,
        rp.score_reached_at
      FROM codex_research_progress rp
      INNER JOIN users u ON u.id = rp.user_id
      LEFT JOIN saves_kv p
        ON p.user_id = u.id AND p.key = 'character-profile.v2'
      LEFT JOIN saves_kv c
        ON c.user_id = u.id AND c.key = 'character.v2'
      WHERE rp.season_id = ${season.seasonId}
        AND rp.score > 0
        AND COALESCE(
          NULLIF(btrim(u.game_name), ''),
          NULLIF(btrim(p.value->>'name'), '')
        ) IS NOT NULL
        AND (u.banned_until IS NULL OR u.banned_until <= ${input.now})
        ${excludeAdminEmails(input.adminEmails)}
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          ORDER BY
            score DESC,
            objective_completed_count DESC,
            diversity_score DESC,
            record_score DESC,
            score_reached_at ASC NULLS LAST,
            user_id ASC
        )::int AS rank
      FROM eligible
    ),
    visible AS (
      SELECT ranked.*
      FROM ranked
      WHERE ranked.user_id = ${input.viewerUserId}
        OR NOT EXISTS (
          SELECT 1
          FROM user_blocks ub
          WHERE ub.blocker_user_id = ${input.viewerUserId}
            AND ub.blocked_user_id = ranked.user_id
        )
    ),
    viewer_rank AS (
      SELECT rank
      FROM ranked
      WHERE user_id = ${input.viewerUserId}
    )
    SELECT
      visible.*,
      (visible.rank <= ${topLimit}) AS is_top
    FROM visible
    LEFT JOIN viewer_rank ON TRUE
    WHERE visible.rank <= ${topLimit}
      OR (
        viewer_rank.rank IS NOT NULL
        AND visible.rank BETWEEN
          GREATEST(1, viewer_rank.rank - ${neighborRadius})
          AND viewer_rank.rank + ${neighborRadius}
      )
    ORDER BY visible.rank ASC
  `);
  const normalized = (result.rows as unknown as RawRankingRow[]).map((row) =>
    normalizeRow(row, input.viewerUserId, input.now)
  );
  const me = normalized.find((entry) => entry.row.mine)?.row ?? null;
  return {
    status: "active",
    seasonId: season.seasonId,
    themeId: season.themeId,
    themeName: season.definition.themeName,
    startAt: season.startAt.toISOString(),
    endAt: season.endAt.toISOString(),
    list: normalized.filter((entry) => entry.isTop).map((entry) => entry.row),
    nearby: me
      ? normalized
        .filter((entry) => Math.abs(entry.row.rank - me.rank) <= neighborRadius)
        .map((entry) => entry.row)
      : [],
    me,
  };
}

export type CodexResearchRankingRuntime<Executor> = {
  readCurrent(executor: Executor, now: Date): Promise<CodexResearchSeasonState | null>;
};

export async function readCodexResearchRankingWithRuntime<
  Executor extends CodexResearchRankingExecutor,
>(
  runtime: CodexResearchRankingRuntime<Executor>,
  executor: Executor,
  input: {
    viewerUserId: string;
    adminEmails: readonly string[];
    now: Date;
    topLimit?: number;
    neighborRadius?: number;
  },
): Promise<CodexResearchRankingReadResult> {
  const season = await runtime.readCurrent(executor, input.now);
  if (!season) return { status: "no_season" };
  return readCodexResearchRankingForSeason(executor, season, input);
}

const DRIZZLE_RUNTIME: CodexResearchRankingRuntime<DbExecutor> = {
  readCurrent: readCurrentCodexResearchSeason,
};

export function readCodexResearchRanking(
  executor: DbExecutor,
  input: {
    viewerUserId: string;
    adminEmails: readonly string[];
    now?: Date;
    topLimit?: number;
    neighborRadius?: number;
  },
): Promise<CodexResearchRankingReadResult> {
  return readCodexResearchRankingWithRuntime(DRIZZLE_RUNTIME, executor, {
    ...input,
    now: input.now ?? new Date(),
  });
}
