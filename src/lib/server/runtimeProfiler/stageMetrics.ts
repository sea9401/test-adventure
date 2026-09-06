export const PROFILE_RANKING_METRICS = [
  "level", "fame", "combatPower", "lifeMastery", "codexCompletion",
  "masteryTower", "achievementScore", "towerWeek", "towerChallenge",
] as const;
type RankingMetric = typeof PROFILE_RANKING_METRICS[number];
const HUNT_STAGES = [
  "hunt.intent", "hunt.transaction", "hunt.prepare", "hunt.battle",
  "hunt.rewards", "hunt.save", "hunt.replay", "hunt.broadcast",
] as const;
export type ProfileStage = typeof HUNT_STAGES[number]
  | `ranking.${RankingMetric}.refresh`
  | `ranking.${"combatPower" | "achievementScore"}.${"database" | "compute"}`;
export type ProfileCounter = "hunt.requestedBattles" | "hunt.resolvedBattles" | "hunt.turns"
  | `ranking.${RankingMetric}.${"cacheHit" | "cacheMiss" | "cacheShared"}`;
export type StageMetric = { count: number; errors: number; totalMs: number; maxMs: number };
export type StageDetails = {
  stages?: Partial<Record<ProfileStage, StageMetric>>;
  counters?: Partial<Record<ProfileCounter, number>>;
};

const allowedStages = new Set<string>([
  ...HUNT_STAGES,
  ...PROFILE_RANKING_METRICS.map((metric) => `ranking.${metric}.refresh`),
  ...["combatPower", "achievementScore"].flatMap((metric) =>
    ["database", "compute"].map((phase) => `ranking.${metric}.${phase}`)),
]);
const allowedCounters = new Set<string>([
  "hunt.requestedBattles", "hunt.resolvedBattles", "hunt.turns",
  ...PROFILE_RANKING_METRICS.flatMap((metric) =>
    ["cacheHit", "cacheMiss", "cacheShared"].map((kind) => `ranking.${metric}.${kind}`)),
]);
export const isProfileStage = (name: string): name is ProfileStage => allowedStages.has(name);
export const isProfileCounter = (name: string): name is ProfileCounter => allowedCounters.has(name);

export function mergeStageDetails(target: StageDetails, source: StageDetails): void {
  for (const [name, value] of Object.entries(source.stages ?? {})) {
    if (!isProfileStage(name)) continue;
    const stages = target.stages ??= {};
    const old = stages[name];
    stages[name] = {
      count: (old?.count ?? 0) + value.count,
      errors: (old?.errors ?? 0) + value.errors,
      totalMs: (old?.totalMs ?? 0) + value.totalMs,
      maxMs: Math.max(old?.maxMs ?? 0, value.maxMs),
    };
  }
  for (const [name, value] of Object.entries(source.counters ?? {})) {
    if (!isProfileCounter(name)) continue;
    const counters = target.counters ??= {};
    counters[name] = (counters[name] ?? 0) + value;
  }
}

export function copyStageDetails(source: StageDetails): StageDetails {
  const copy: StageDetails = {};
  mergeStageDetails(copy, source);
  for (const value of Object.values(copy.stages ?? {})) {
    value.totalMs = Math.round(value.totalMs * 100) / 100;
    value.maxMs = Math.round(value.maxMs * 100) / 100;
  }
  return copy;
}
