import type { TreasureSiteOptionId } from "./treasureDig";

export const TREASURE_ACHIEVEMENTS_KEY = "treasure-achievements.v1";

export type TreasureAchievementStats = {
  successes: number;
  probeSuccesses: number;
  bestCondition: number;
  bestAppraisedValue: number;
  siteSuccesses: Partial<Record<TreasureSiteOptionId, number>>;
};

export type TreasureAchievementHit = {
  siteOptionId: TreasureSiteOptionId;
  condition: number;
  appraisedValue: number;
  usedProbe: boolean;
};

export type TreasureAchievementTitleId =
  | "treasure_first_find"
  | "treasure_veteran_excavator"
  | "treasure_pristine_keeper"
  | "treasure_probe_pathfinder"
  | "treasure_three_site_surveyor";

export type TreasureAchievementTitleRule = {
  titleId: TreasureAchievementTitleId;
  reached: (stats: TreasureAchievementStats) => boolean;
};

export const TREASURE_ACHIEVEMENT_TITLE_RULES: readonly TreasureAchievementTitleRule[] = [
  {
    titleId: "treasure_first_find",
    reached: (stats) => stats.successes >= 1,
  },
  {
    titleId: "treasure_veteran_excavator",
    reached: (stats) => stats.successes >= 10,
  },
  {
    titleId: "treasure_pristine_keeper",
    reached: (stats) => stats.bestCondition >= 90,
  },
  {
    titleId: "treasure_probe_pathfinder",
    reached: (stats) => stats.probeSuccesses >= 5,
  },
  {
    titleId: "treasure_three_site_surveyor",
    reached: (stats) => Object.values(stats.siteSuccesses).filter((count) => (count ?? 0) > 0).length >= 3,
  },
] as const;

const EMPTY_STATS: TreasureAchievementStats = {
  successes: 0,
  probeSuccesses: 0,
  bestCondition: 0,
  bestAppraisedValue: 0,
  siteSuccesses: {},
};

function nonNegativeInt(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

export function parseTreasureAchievementStats(raw: unknown): TreasureAchievementStats {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATS, siteSuccesses: {} };
  const r = raw as Record<string, unknown>;
  const rawSiteSuccesses =
    r.siteSuccesses && typeof r.siteSuccesses === "object"
      ? (r.siteSuccesses as Record<string, unknown>)
      : {};
  const siteSuccesses: TreasureAchievementStats["siteSuccesses"] = {};
  for (const siteId of ["old_market", "royal_tomb", "collapsed_shrine"] as const) {
    const count = nonNegativeInt(rawSiteSuccesses[siteId]);
    if (count > 0) siteSuccesses[siteId] = count;
  }
  return {
    successes: nonNegativeInt(r.successes),
    probeSuccesses: nonNegativeInt(r.probeSuccesses),
    bestCondition: Math.min(100, nonNegativeInt(r.bestCondition)),
    bestAppraisedValue: nonNegativeInt(r.bestAppraisedValue),
    siteSuccesses,
  };
}

export function recordTreasureAchievementHit(
  stats: TreasureAchievementStats,
  hit: TreasureAchievementHit,
): TreasureAchievementStats {
  const siteSuccesses = {
    ...stats.siteSuccesses,
    [hit.siteOptionId]: (stats.siteSuccesses[hit.siteOptionId] ?? 0) + 1,
  };
  return {
    successes: stats.successes + 1,
    probeSuccesses: stats.probeSuccesses + (hit.usedProbe ? 1 : 0),
    bestCondition: Math.max(stats.bestCondition, hit.condition),
    bestAppraisedValue: Math.max(stats.bestAppraisedValue, hit.appraisedValue),
    siteSuccesses,
  };
}

export function reachedTreasureAchievementTitleIds(
  stats: TreasureAchievementStats,
): TreasureAchievementTitleId[] {
  return TREASURE_ACHIEVEMENT_TITLE_RULES.filter((rule) =>
    rule.reached(stats),
  ).map((rule) => rule.titleId);
}
