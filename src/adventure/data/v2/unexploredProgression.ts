import { getLevelTable } from "@/lib/leveling";
import {
  UNEXPLORED_ACHIEVEMENT_IDS,
  type UnexploredAchievementId,
  type UnexploredSave,
} from "./unexploredState";

const MAX_XP_POINTS = 30;
const XP_WEIGHT_TOTAL = 29 * 30 / 2;
const TOTAL_LOOP_XP = getLevelTable().at(-1)?.cumulative ?? 0;
const TOTAL_EXPLORATION_XP = TOTAL_LOOP_XP * 5;

const pointCosts = (() => {
  const costs = Array.from({ length: MAX_XP_POINTS + 1 }, () => 0);
  let allocated = 0;
  for (let point = 2; point < MAX_XP_POINTS; point += 1) {
    const cost = Math.max(
      1,
      Math.round((TOTAL_EXPLORATION_XP * (point - 1)) / XP_WEIGHT_TOTAL),
    );
    costs[point] = cost;
    allocated += cost;
  }
  costs[MAX_XP_POINTS] = Math.max(1, TOTAL_EXPLORATION_XP - allocated);
  return costs;
})();

export function explorationPointCost(point: number): number {
  const normalized = Math.floor(Number(point));
  return normalized >= 2 && normalized <= MAX_XP_POINTS
    ? pointCosts[normalized]
    : 0;
}

export function unexploredTotalXpCost(): number {
  return pointCosts.reduce((sum, cost) => sum + cost, 0);
}

export function withFirstExplorationPoint(save: UnexploredSave): UnexploredSave {
  return save.xpPoints >= 1 ? save : { ...save, xpPoints: 1 };
}

export type ExplorationXpGrant = {
  save: UnexploredSave;
  pointsGained: number;
  acceptedXp: number;
  discardedXp: number;
};

export function grantExplorationXp(
  save: UnexploredSave,
  rawAmount: number,
): ExplorationXpGrant {
  const incoming = Number.isFinite(rawAmount)
    ? Math.max(0, Math.floor(rawAmount))
    : 0;
  const startingPoints = Math.min(MAX_XP_POINTS, Math.max(0, save.xpPoints));
  if (startingPoints >= MAX_XP_POINTS) {
    return {
      save: save.explorationXp === 0 ? save : { ...save, explorationXp: 0 },
      pointsGained: 0,
      acceptedXp: 0,
      discardedXp: Math.max(0, save.explorationXp) + incoming,
    };
  }

  let points = Math.max(1, startingPoints);
  let xp = Math.max(0, Math.floor(save.explorationXp)) + incoming;
  while (points < MAX_XP_POINTS) {
    const cost = explorationPointCost(points + 1);
    if (xp < cost) break;
    xp -= cost;
    points += 1;
  }

  let discardedXp = 0;
  if (points >= MAX_XP_POINTS) {
    discardedXp = xp;
    xp = 0;
  }
  return {
    save: { ...save, xpPoints: points, explorationXp: xp },
    pointsGained: points - startingPoints,
    acceptedXp: incoming,
    discardedXp,
  };
}

export type UnexploredAchievementSignals = {
  coopBossKindCount?: number;
  unexploredHuntWon?: boolean;
  specialMonsterKilled?: boolean;
  summonStoneCrafted?: boolean;
  activePoolCount?: number;
};

export function unexploredAchievementCandidates(
  signals: UnexploredAchievementSignals,
): UnexploredAchievementId[] {
  const ids: UnexploredAchievementId[] = [];
  const bossKinds = Math.max(0, Math.floor(Number(signals.coopBossKindCount) || 0));
  for (const threshold of [1, 3, 6, 9, 12] as const) {
    if (bossKinds >= threshold) ids.push(`boss_kinds_${threshold}`);
  }
  if (signals.unexploredHuntWon) ids.push("first_unexplored_hunt");
  if (signals.specialMonsterKilled) ids.push("first_special_kill");
  if (signals.summonStoneCrafted) ids.push("first_summon_stone_craft");
  const activePools = Math.max(0, Math.floor(Number(signals.activePoolCount) || 0));
  if (activePools >= 2) ids.push("activate_two_pools");
  if (activePools >= 3) ids.push("activate_three_pools");
  return ids;
}

export function grantUnexploredAchievements(
  save: UnexploredSave,
  candidates: readonly UnexploredAchievementId[],
): { save: UnexploredSave; addedIds: UnexploredAchievementId[] } {
  const knownIds = new Set<string>(UNEXPLORED_ACHIEVEMENT_IDS);
  const existing = new Set(save.achievementIds);
  const addedIds: UnexploredAchievementId[] = [];
  for (const id of candidates) {
    if (!knownIds.has(id) || existing.has(id)) continue;
    existing.add(id);
    addedIds.push(id);
  }
  return addedIds.length === 0
    ? { save, addedIds }
    : {
        save: {
          ...save,
          achievementIds: [...save.achievementIds, ...addedIds],
        },
        addedIds,
      };
}
