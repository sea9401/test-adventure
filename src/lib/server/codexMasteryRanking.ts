import { sql, type SQL } from "drizzle-orm";
import { displayCodexMasteryScore } from "@/adventure/data/v2/codexMastery";
import type {
  CodexMasteryRankingRow,
  CodexMasteryRankingScope,
} from "@/adventure/data/v2/codexMasteryRanking";
import { isStoredAvatarId, type Avatar } from "@/adventure/profile/avatars";
import { museunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import type { DbExecutor } from "./savesKv";

const DEFAULT_TOP_LIMIT = 50;
const MAX_TOP_LIMIT = 100;
const DEFAULT_NEIGHBOR_RADIUS = 2;
const MAX_NEIGHBOR_RADIUS = 5;

type ScopeSql = {
  score: SQL;
  reachedAt: SQL;
};

const SCOPE_SQL: Record<CodexMasteryRankingScope, ScopeSql> = {
  overall: {
    score: sql.raw("cm.total_score_milli"),
    reachedAt: sql.raw("cm.score_reached_at"),
  },
  equipment: {
    score: sql.raw("cm.equipment_score_milli"),
    reachedAt: sql.raw("cm.equipment_score_reached_at"),
  },
  fish: {
    score: sql.raw("cm.fish_score_milli"),
    reachedAt: sql.raw("cm.fish_score_reached_at"),
  },
  monster: {
    score: sql.raw("cm.monster_score_milli"),
    reachedAt: sql.raw("cm.monster_score_reached_at"),
  },
  cooking: {
    score: sql.raw("cm.cooking_score_milli"),
    reachedAt: sql.raw("cm.cooking_score_reached_at"),
  },
  life: {
    score: sql.raw("cm.life_score_milli"),
    reachedAt: sql.raw("cm.life_score_reached_at"),
  },
  job: {
    score: sql.raw("cm.job_score_milli"),
    reachedAt: sql.raw("cm.job_score_reached_at"),
  },
};

export type CodexMasteryRankingExecutor = Pick<DbExecutor, "execute">;

type RawRankingRow = {
  user_id: unknown;
  name: unknown;
  avatar: unknown;
  character_save: unknown;
  rank: unknown;
  is_top: unknown;
  score_milli: unknown;
  total_score_milli: unknown;
  equipment_score_milli: unknown;
  fish_score_milli: unknown;
  monster_score_milli: unknown;
  cooking_score_milli: unknown;
  life_score_milli: unknown;
  job_score_milli: unknown;
  bronze_count: unknown;
  silver_count: unknown;
  gold_count: unknown;
  platinum_count: unknown;
  diamond_count: unknown;
  legendary_count: unknown;
  seal_count: unknown;
  scored_category_count: unknown;
};

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
    throw new Error("invalid codex mastery ranking row");
  }
  return parsed;
}

function positiveSafeInteger(value: unknown): number {
  const parsed = nonNegativeSafeInteger(value);
  if (parsed === 0) throw new Error("invalid codex mastery ranking row");
  return parsed;
}

function rankingAvatar(raw: unknown): Avatar {
  if (raw === "male") return "male1";
  if (raw === "female") return "female1";
  return isStoredAvatarId(raw) ? raw : "male1";
}

function characterCosmetics(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return museunCosmeticAppearance(undefined, Date.now());
  }
  const character = raw as {
    museunCosmetics?: unknown;
    arenaChampionshipBadges?: unknown;
  };
  return museunCosmeticAppearance(
    character.museunCosmetics,
    Date.now(),
    character.arenaChampionshipBadges,
  );
}

function normalizeRow(raw: RawRankingRow, viewerUserId: string) {
  if (
    typeof raw.user_id !== "string" ||
    typeof raw.name !== "string" ||
    raw.name.trim() === ""
  ) {
    throw new Error("invalid codex mastery ranking row");
  }
  const cosmetics = characterCosmetics(raw.character_save);
  const row: CodexMasteryRankingRow = {
    rank: positiveSafeInteger(raw.rank),
    name: raw.name.trim(),
    avatar: rankingAvatar(raw.avatar),
    score: displayCodexMasteryScore(nonNegativeSafeInteger(raw.score_milli)),
    totalScore: displayCodexMasteryScore(
      nonNegativeSafeInteger(raw.total_score_milli),
    ),
    categoryScores: {
      equipment: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.equipment_score_milli),
      ),
      fish: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.fish_score_milli),
      ),
      monster: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.monster_score_milli),
      ),
      cooking: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.cooking_score_milli),
      ),
      life: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.life_score_milli),
      ),
      job: displayCodexMasteryScore(
        nonNegativeSafeInteger(raw.job_score_milli),
      ),
    },
    stageCounts: {
      bronze: nonNegativeSafeInteger(raw.bronze_count),
      silver: nonNegativeSafeInteger(raw.silver_count),
      gold: nonNegativeSafeInteger(raw.gold_count),
      platinum: nonNegativeSafeInteger(raw.platinum_count),
      diamond: nonNegativeSafeInteger(raw.diamond_count),
      legendary: nonNegativeSafeInteger(raw.legendary_count),
    },
    goldOrHigherCount: nonNegativeSafeInteger(raw.gold_count),
    sealCount: nonNegativeSafeInteger(raw.seal_count),
    scoredCategoryCount: nonNegativeSafeInteger(raw.scored_category_count),
    mine: raw.user_id === viewerUserId,
    profileBorder: cosmetics.profileBorder,
    chatNameEffect: cosmetics.chatNameEffect,
  };
  return {
    userId: raw.user_id,
    isTop: raw.is_top === true,
    row,
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

export async function readCodexMasteryRanking(
  executor: CodexMasteryRankingExecutor,
  input: {
    viewerUserId: string;
    scope: CodexMasteryRankingScope;
    adminEmails: readonly string[];
    topLimit?: number;
    neighborRadius?: number;
  },
): Promise<{
  list: CodexMasteryRankingRow[];
  nearby: CodexMasteryRankingRow[];
  me: CodexMasteryRankingRow | null;
}> {
  const topLimit = boundedInteger(input.topLimit, DEFAULT_TOP_LIMIT, MAX_TOP_LIMIT);
  const neighborRadius = boundedInteger(
    input.neighborRadius,
    DEFAULT_NEIGHBOR_RADIUS,
    MAX_NEIGHBOR_RADIUS,
  );
  const scope = SCOPE_SQL[input.scope];
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
        ${scope.score} AS score_milli,
        ${scope.reachedAt} AS score_reached_at,
        cm.total_score_milli,
        cm.equipment_score_milli,
        cm.fish_score_milli,
        cm.monster_score_milli,
        cm.cooking_score_milli,
        cm.life_score_milli,
        cm.job_score_milli,
        cm.bronze_count,
        cm.silver_count,
        cm.gold_count,
        cm.platinum_count,
        cm.diamond_count,
        cm.legendary_count,
        cm.seal_count,
        cm.scored_category_count
      FROM codex_mastery_summary cm
      INNER JOIN users u ON u.id = cm.user_id
      LEFT JOIN saves_kv p
        ON p.user_id = u.id AND p.key = 'character-profile.v2'
      LEFT JOIN saves_kv c
        ON c.user_id = u.id AND c.key = 'character.v2'
      WHERE ${scope.score} > 0
        AND COALESCE(
          NULLIF(btrim(u.game_name), ''),
          NULLIF(btrim(p.value->>'name'), '')
        ) IS NOT NULL
        AND (u.banned_until IS NULL OR u.banned_until <= NOW())
        ${excludeAdminEmails(input.adminEmails)}
        AND (
          u.id = ${input.viewerUserId}
          OR NOT EXISTS (
            SELECT 1
            FROM user_blocks ub
            WHERE ub.blocker_user_id = ${input.viewerUserId}
              AND ub.blocked_user_id = u.id
          )
        )
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          ORDER BY
            score_milli DESC,
            gold_count DESC,
            seal_count DESC,
            scored_category_count DESC,
            score_reached_at ASC NULLS LAST,
            user_id ASC
        )::int AS rank
      FROM eligible
    ),
    viewer_rank AS (
      SELECT rank
      FROM ranked
      WHERE user_id = ${input.viewerUserId}
    )
    SELECT
      ranked.*,
      (ranked.rank <= ${topLimit}) AS is_top
    FROM ranked
    LEFT JOIN viewer_rank ON TRUE
    WHERE ranked.rank <= ${topLimit}
      OR (
        viewer_rank.rank IS NOT NULL
        AND ranked.rank BETWEEN
          GREATEST(1, viewer_rank.rank - ${neighborRadius})
          AND viewer_rank.rank + ${neighborRadius}
      )
    ORDER BY ranked.rank ASC
  `);

  const normalized = (result.rows as unknown as RawRankingRow[]).map((row) =>
    normalizeRow(row, input.viewerUserId)
  );
  const me = normalized.find((entry) => entry.row.mine)?.row ?? null;
  const nearby = me
    ? normalized
      .filter((entry) => Math.abs(entry.row.rank - me.rank) <= neighborRadius)
      .map((entry) => entry.row)
    : [];
  return {
    list: normalized.filter((entry) => entry.isTop).map((entry) => entry.row),
    nearby,
    me,
  };
}
