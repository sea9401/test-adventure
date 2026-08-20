import { eq, sql } from "drizzle-orm";
import {
  kstCodexResearchSeasonWindow,
  type CodexResearchSeasonStatus,
} from "@/adventure/data/v2/codexResearch";
import {
  CODEX_MASTERY_TROPHY_TIERS,
  type CodexMasteryTrophyTier,
} from "@/adventure/data/v2/codexMasteryTrophies";
import {
  codexResearchSeasons,
} from "@/db/schema";
import {
  codexResearchSeasonRowToState,
  type CodexResearchSeasonState,
} from "./codexResearchRepository";
import type { DbExecutor } from "./savesKv";

export type CodexResearchSeasonOpsState =
  | "ready"
  | "too_early"
  | "closed"
  | "inconsistent";

export type CodexResearchSeasonOpsSummary = {
  seasonId: string;
  themeId: string;
  themeName: string;
  definitionVersion: number;
  startAt: string;
  endAt: string;
  status: CodexResearchSeasonStatus;
  settledAt: string | null;
  opsState: CodexResearchSeasonOpsState;
  counts: {
    progress: number;
    scored: number;
    finalRanked: number;
    finalTiers: Record<CodexMasteryTrophyTier, number>;
    trophies: number;
  };
};

type RawOpsRow = {
  season_id: unknown;
  theme_id: unknown;
  theme_name: unknown;
  definition_version: unknown;
  start_at: unknown;
  end_at: unknown;
  status: unknown;
  settled_at: unknown;
  progress_count: unknown;
  scored_count: unknown;
  final_rank_count: unknown;
  bronze_count: unknown;
  silver_count: unknown;
  gold_count: unknown;
  platinum_count: unknown;
  diamond_count: unknown;
  legendary_count: unknown;
  trophy_count: unknown;
};

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validStatus(value: unknown): value is CodexResearchSeasonStatus {
  return value === "scheduled" || value === "active" ||
    value === "settling" || value === "closed";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("codex research operations row is malformed");
  }
  return parsed;
}

export function codexResearchSeasonOpsRowToSummary(
  row: RawOpsRow,
  now: Date,
): CodexResearchSeasonOpsSummary {
  if (!validDate(now)) throw new Error("now must be a valid date");
  if (
    typeof row.season_id !== "string" ||
    typeof row.theme_id !== "string" || row.theme_id.trim().length === 0 ||
    typeof row.theme_name !== "string" || row.theme_name.trim().length === 0 ||
    !validDate(row.start_at) ||
    !validDate(row.end_at) ||
    !validStatus(row.status) ||
    (row.settled_at !== null && !validDate(row.settled_at))
  ) {
    throw new Error("codex research operations row is malformed");
  }
  const window = kstCodexResearchSeasonWindow(row.season_id);
  if (
    window.startAt.getTime() !== row.start_at.getTime() ||
    window.endAt.getTime() !== row.end_at.getTime()
  ) {
    throw new Error("codex research operations row is malformed");
  }

  const definitionVersion = integer(row.definition_version);
  if (definitionVersion < 1) {
    throw new Error("codex research operations row is malformed");
  }
  const finalTiers = {
    bronze: integer(row.bronze_count),
    silver: integer(row.silver_count),
    gold: integer(row.gold_count),
    platinum: integer(row.platinum_count),
    diamond: integer(row.diamond_count),
    legendary: integer(row.legendary_count),
  } satisfies Record<CodexMasteryTrophyTier, number>;
  const progress = integer(row.progress_count);
  const scored = integer(row.scored_count);
  const finalRanked = integer(row.final_rank_count);
  const trophies = integer(row.trophy_count);
  const tiered = CODEX_MASTERY_TROPHY_TIERS.reduce(
    (total, tier) => total + finalTiers[tier],
    0,
  );
  const inconsistent =
    progress < scored || scored < finalRanked || finalRanked < tiered ||
    trophies > tiered ||
    (row.status === "closed" && row.settled_at === null) ||
    (row.status !== "closed" && row.settled_at !== null) ||
    (row.status === "closed" && scored > 0 && finalRanked === 0) ||
    (row.status !== "closed" && finalRanked > 0) ||
    (row.status === "settling" && row.end_at.getTime() > now.getTime());
  const opsState: CodexResearchSeasonOpsState = inconsistent
    ? "inconsistent"
    : row.status === "closed"
      ? "closed"
      : row.end_at.getTime() > now.getTime()
        ? "too_early"
        : "ready";

  return {
    seasonId: row.season_id,
    themeId: row.theme_id,
    themeName: row.theme_name,
    definitionVersion,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    status: row.status,
    settledAt: row.settled_at?.toISOString() ?? null,
    opsState,
    counts: { progress, scored, finalRanked, finalTiers, trophies },
  };
}

export async function readCodexResearchSeasonForOps(
  executor: DbExecutor,
  seasonId: string,
): Promise<CodexResearchSeasonState | null> {
  kstCodexResearchSeasonWindow(seasonId);
  const rows = await executor
    .select()
    .from(codexResearchSeasons)
    .where(eq(codexResearchSeasons.seasonId, seasonId))
    .limit(1);
  return rows[0] ? codexResearchSeasonRowToState(rows[0]) : null;
}

export async function readCodexResearchSeasonOpsList(
  executor: Pick<DbExecutor, "execute">,
  now: Date,
  limit = 24,
): Promise<CodexResearchSeasonOpsSummary[]> {
  if (!validDate(now)) throw new Error("now must be a valid date");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("codex research operations limit is invalid");
  }
  const result = await executor.execute(sql`
    SELECT
      s.season_id,
      s.theme_id,
      s.definition_snapshot ->> 'themeName' AS theme_name,
      s.definition_snapshot ->> 'version' AS definition_version,
      s.start_at,
      s.end_at,
      s.status,
      s.settled_at,
      COUNT(p.user_id)::bigint AS progress_count,
      COUNT(p.user_id) FILTER (WHERE p.score > 0)::bigint AS scored_count,
      COUNT(p.user_id) FILTER (WHERE p.final_rank IS NOT NULL)::bigint
        AS final_rank_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'bronze')::bigint
        AS bronze_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'silver')::bigint
        AS silver_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'gold')::bigint
        AS gold_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'platinum')::bigint
        AS platinum_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'diamond')::bigint
        AS diamond_count,
      COUNT(p.user_id) FILTER (WHERE p.final_tier = 'legendary')::bigint
        AS legendary_count,
      COALESCE(t.trophy_count, 0)::bigint AS trophy_count
    FROM codex_research_seasons s
    LEFT JOIN codex_research_progress p ON p.season_id = s.season_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS trophy_count
      FROM codex_trophy_history h
      WHERE h.trophy_id = 'research:' || s.season_id
        AND h.trophy_kind = 'research_season'
    ) t ON TRUE
    GROUP BY s.season_id, t.trophy_count
    ORDER BY s.start_at DESC
    LIMIT ${limit}
  `);
  return (result.rows as unknown as RawOpsRow[]).map((row) =>
    codexResearchSeasonOpsRowToSummary(row, now)
  );
}

export async function countCodexResearchSeasonTrophies(
  executor: Pick<DbExecutor, "execute">,
  seasonId: string,
): Promise<number> {
  kstCodexResearchSeasonWindow(seasonId);
  const result = await executor.execute(sql`
    SELECT COUNT(*)::bigint AS trophy_count
    FROM codex_trophy_history
    WHERE trophy_id = ${`research:${seasonId}`}
      AND trophy_kind = 'research_season'
  `);
  const row = (result.rows as unknown as Array<{ trophy_count: unknown }>)[0];
  if (!row) throw new Error("codex research trophy count row is missing");
  return integer(row.trophy_count);
}
