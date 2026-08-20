import { sql } from "drizzle-orm";
import {
  type CodexResearchArchiveRow,
  type CodexResearchArchiveSeason,
} from "@/adventure/data/v2/codexResearchArchive";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import { museunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import { isStoredAvatarId, type Avatar } from "@/adventure/profile/avatars";
import { kstCodexResearchSeasonWindow } from "@/adventure/data/v2/codexResearch";
import type { DbExecutor } from "./savesKv";

const DEFAULT_TOP_LIMIT = 50;
const MAX_TOP_LIMIT = 100;
const DEFAULT_NEIGHBOR_RADIUS = 2;
const MAX_NEIGHBOR_RADIUS = 5;

export type CodexResearchArchiveExecutor = Pick<DbExecutor, "execute">;

export type CodexResearchArchiveReadResult =
  | { status: "no_season"; seasons: CodexResearchArchiveSeason[] }
  | {
      status: "ready";
      seasons: CodexResearchArchiveSeason[];
      selectedSeasonId: string;
      list: CodexResearchArchiveRow[];
      nearby: CodexResearchArchiveRow[];
      me: CodexResearchArchiveRow | null;
    };

type RawSeason = {
  season_id: unknown;
  theme_id: unknown;
  theme_name: unknown;
  start_at_ms: unknown;
  end_at_ms: unknown;
  settled_at_ms: unknown;
  published_at_ms: unknown;
  participant_count: unknown;
  trophy_count: unknown;
};

type RawRow = {
  user_id: unknown;
  name: unknown;
  avatar: unknown;
  character_save: unknown;
  rank: unknown;
  final_tier: unknown;
  is_top: unknown;
  score: unknown;
  objective_completed_count: unknown;
  diversity_score: unknown;
  record_score: unknown;
};

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error("invalid codex research archive row");
  }
  return parsed;
}

function date(value: unknown): Date {
  const parsed = new Date(integer(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid codex research archive row");
  return parsed;
}

function bound(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) < 0) return fallback;
  return Math.min(value ?? fallback, max);
}

function parseSeason(raw: RawSeason): CodexResearchArchiveSeason {
  if (
    typeof raw.season_id !== "string" || typeof raw.theme_id !== "string" ||
    typeof raw.theme_name !== "string" || raw.theme_name.trim() === ""
  ) throw new Error("invalid codex research archive row");
  const startAt = date(raw.start_at_ms);
  const endAt = date(raw.end_at_ms);
  const settledAt = date(raw.settled_at_ms);
  const publishedAt = date(raw.published_at_ms);
  const window = kstCodexResearchSeasonWindow(raw.season_id);
  if (window.startAt.getTime() !== startAt.getTime() || window.endAt.getTime() !== endAt.getTime()) {
    throw new Error("invalid codex research archive row");
  }
  return {
    seasonId: raw.season_id,
    themeId: raw.theme_id,
    themeName: raw.theme_name.trim(),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    settledAt: settledAt.toISOString(),
    publishedAt: publishedAt.toISOString(),
    participantCount: integer(raw.participant_count),
    trophyCount: integer(raw.trophy_count),
  };
}

function avatar(value: unknown): Avatar {
  if (value === "male") return "male1";
  if (value === "female") return "female1";
  return isStoredAvatarId(value) ? value : "male1";
}

function finalTier(value: unknown): CodexMasteryTrophyTier | null {
  if (value === null) return null;
  if (typeof value === "string" &&
    (CODEX_MASTERY_TROPHY_TIERS as readonly string[]).includes(value)) {
    return value as CodexMasteryTrophyTier;
  }
  throw new Error("invalid codex research archive row");
}

function parseRow(raw: RawRow, viewerUserId: string, now: Date) {
  if (
    typeof raw.user_id !== "string" || typeof raw.name !== "string" ||
    raw.name.trim() === "" || typeof raw.is_top !== "boolean"
  ) throw new Error("invalid codex research archive row");
  const rank = integer(raw.rank, 1);
  const score = integer(raw.score, 0, 20_000);
  const diversityScore = integer(raw.diversity_score, 0, 5_000);
  const recordScore = integer(raw.record_score, 0, 3_000);
  const objectiveScore = score - diversityScore - recordScore;
  const objectiveCompletedCount = integer(raw.objective_completed_count, 0, 18);
  if (objectiveScore < 0 || objectiveScore > 12_000) {
    throw new Error("invalid codex research archive row");
  }
  const character = raw.character_save && typeof raw.character_save === "object" &&
      !Array.isArray(raw.character_save)
    ? raw.character_save as { museunCosmetics?: unknown; arenaChampionshipBadges?: unknown }
    : undefined;
  const cosmetics = museunCosmeticAppearance(
    character?.museunCosmetics,
    now.getTime(),
    character?.arenaChampionshipBadges,
  );
  return {
    isTop: raw.is_top,
    row: {
      rank,
      name: raw.name.trim(),
      avatar: avatar(raw.avatar),
      score,
      objectiveCompletedCount,
      objectiveScore,
      diversityScore,
      recordScore,
      finalTier: finalTier(raw.final_tier),
      mine: raw.user_id === viewerUserId,
      profileBorder: cosmetics.profileBorder,
      chatNameEffect: cosmetics.chatNameEffect,
      firstPlaceEngraving: rank === 1,
    } satisfies CodexResearchArchiveRow,
  };
}

export async function readCodexResearchArchive(
  executor: CodexResearchArchiveExecutor,
  input: {
    viewerUserId: string;
    seasonId?: string;
    now?: Date;
    topLimit?: number;
    neighborRadius?: number;
  },
): Promise<CodexResearchArchiveReadResult> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("now must be a valid date");
  if (input.seasonId) kstCodexResearchSeasonWindow(input.seasonId);
  const seasonResult = await executor.execute(sql`
    SELECT
      s.season_id,
      s.theme_id,
      s.definition_snapshot ->> 'themeName' AS theme_name,
      (EXTRACT(EPOCH FROM s.start_at) * 1000)::bigint AS start_at_ms,
      (EXTRACT(EPOCH FROM s.end_at) * 1000)::bigint AS end_at_ms,
      (EXTRACT(EPOCH FROM s.settled_at) * 1000)::bigint AS settled_at_ms,
      (EXTRACT(EPOCH FROM s.published_at) * 1000)::bigint AS published_at_ms,
      COUNT(p.user_id) FILTER (WHERE p.final_rank IS NOT NULL)::bigint AS participant_count,
      COALESCE(t.trophy_count, 0)::bigint AS trophy_count
    FROM codex_research_seasons s
    LEFT JOIN codex_research_progress p ON p.season_id = s.season_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS trophy_count
      FROM codex_trophy_history h
      WHERE h.trophy_id = 'research:' || s.season_id
        AND h.trophy_kind = 'research_season'
    ) t ON TRUE
    WHERE s.status = 'closed'
      AND s.published_at IS NOT NULL
    GROUP BY s.season_id, t.trophy_count
    ORDER BY s.start_at DESC
    LIMIT 24
  `);
  const seasons = (seasonResult.rows as unknown as RawSeason[]).map(parseSeason);
  const selected = input.seasonId
    ? seasons.find(({ seasonId }) => seasonId === input.seasonId)
    : seasons[0];
  if (!selected) return { status: "no_season", seasons };

  const topLimit = bound(input.topLimit, DEFAULT_TOP_LIMIT, MAX_TOP_LIMIT);
  const neighborRadius = bound(
    input.neighborRadius,
    DEFAULT_NEIGHBOR_RADIUS,
    MAX_NEIGHBOR_RADIUS,
  );
  const result = await executor.execute(sql`
    WITH viewer_rank AS (
      SELECT final_rank
      FROM codex_research_progress
      WHERE season_id = ${selected.seasonId}
        AND user_id = ${input.viewerUserId}
        AND final_rank IS NOT NULL
    )
    SELECT
      rp.user_id,
      COALESCE(
        NULLIF(btrim(u.game_name), ''),
        NULLIF(btrim(p.value->>'name'), '')
      ) AS name,
      p.value->>'gender' AS avatar,
      c.value AS character_save,
      rp.final_rank AS rank,
      rp.final_tier,
      (rp.final_rank <= ${topLimit}) AS is_top,
      rp.score,
      rp.objective_completed_count,
      rp.diversity_score,
      rp.record_score
    FROM codex_research_progress rp
    INNER JOIN users u ON u.id = rp.user_id
    LEFT JOIN saves_kv p ON p.user_id = u.id AND p.key = 'character-profile.v2'
    LEFT JOIN saves_kv c ON c.user_id = u.id AND c.key = 'character.v2'
    LEFT JOIN viewer_rank ON TRUE
    WHERE rp.season_id = ${selected.seasonId}
      AND rp.final_rank IS NOT NULL
      AND COALESCE(
        NULLIF(btrim(u.game_name), ''),
        NULLIF(btrim(p.value->>'name'), '')
      ) IS NOT NULL
      AND (
        rp.user_id = ${input.viewerUserId}
        OR NOT EXISTS (
          SELECT 1 FROM user_blocks ub
          WHERE ub.blocker_user_id = ${input.viewerUserId}
            AND ub.blocked_user_id = rp.user_id
        )
      )
      AND (
        rp.final_rank <= ${topLimit}
        OR (
          viewer_rank.final_rank IS NOT NULL
          AND rp.final_rank BETWEEN
            GREATEST(1, viewer_rank.final_rank - ${neighborRadius})
            AND viewer_rank.final_rank + ${neighborRadius}
        )
      )
    ORDER BY rp.final_rank ASC
  `);
  const normalized = (result.rows as unknown as RawRow[]).map((row) =>
    parseRow(row, input.viewerUserId, now)
  );
  const me = normalized.find(({ row }) => row.mine)?.row ?? null;
  return {
    status: "ready",
    seasons,
    selectedSeasonId: selected.seasonId,
    list: normalized.filter(({ isTop }) => isTop).map(({ row }) => row),
    nearby: me
      ? normalized.filter(({ row }) => Math.abs(row.rank - me.rank) <= neighborRadius)
        .map(({ row }) => row)
      : [],
    me,
  };
}
