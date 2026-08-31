import { getLevelTable } from "@/lib/leveling";
import {
  UNEXPLORED_BOSS_IDS,
  parseUnexploredBossId,
  type UnexploredBossId,
} from "./unexploredBosses";
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
  defeatedBossIds?: readonly unknown[];
  unexploredHuntWon?: boolean;
  specialMonsterKilled?: boolean;
  summonStoneCrafted?: boolean;
  activePoolCount?: number;
};

const BOSS_ACHIEVEMENT_ID_BY_BOSS = {
  tracking_weapon: "defeat_tracking_weapon",
  toxic_blood_lord: "defeat_toxic_blood_lord",
  glacial_colossus: "defeat_glacial_colossus",
} as const satisfies Record<UnexploredBossId, UnexploredAchievementId>;

export const UNEXPLORED_ACHIEVEMENTS = [
  {
    id: "first_personal_boss",
    name: "미개척지 보스 첫 처치",
    description: "미개척지 개인 보스를 처음 처치하세요.",
  },
  {
    id: "defeat_tracking_weapon",
    name: "추적 병기 처치",
    description: "추적 병기를 처치하세요.",
  },
  {
    id: "defeat_toxic_blood_lord",
    name: "독혈 군주 처치",
    description: "독혈 군주를 처치하세요.",
  },
  {
    id: "defeat_glacial_colossus",
    name: "빙하 거수 처치",
    description: "빙하 거수를 처치하세요.",
  },
  {
    id: "defeat_all_personal_bosses",
    name: "미개척지 보스 정복",
    description: "미개척지 개인 보스 3종을 모두 처치하세요.",
  },
  {
    id: "first_unexplored_hunt",
    name: "첫 미개척지 탐사",
    description: "미개척지 사냥에서 처음 승리하세요.",
  },
  {
    id: "first_special_kill",
    name: "특수 개체 첫 처치",
    description: "미개척지의 특수 몬스터를 처음 처치하세요.",
  },
  {
    id: "first_summon_stone_craft",
    name: "소환석 첫 제작",
    description: "미개척지 보스 소환석을 처음 제작하세요.",
  },
  {
    id: "activate_two_pools",
    name: "특화 풀 2종 활성화",
    description: "한 탐사망에서 특화 몬스터 풀 2종을 활성화하세요.",
  },
  {
    id: "activate_three_pools",
    name: "특화 풀 3종 활성화",
    description: "한 탐사망에서 특화 몬스터 풀 3종을 활성화하세요.",
  },
] as const satisfies readonly {
  id: UnexploredAchievementId;
  name: string;
  description: string;
}[];

export function unexploredAchievementCandidates(
  signals: UnexploredAchievementSignals,
): UnexploredAchievementId[] {
  const ids: UnexploredAchievementId[] = [];
  const defeatedBosses = new Set(
    (signals.defeatedBossIds ?? []).flatMap((value) => {
      const bossId = parseUnexploredBossId(value);
      return bossId ? [bossId] : [];
    }),
  );
  if (defeatedBosses.size > 0) ids.push("first_personal_boss");
  for (const bossId of UNEXPLORED_BOSS_IDS) {
    if (defeatedBosses.has(bossId)) {
      ids.push(BOSS_ACHIEVEMENT_ID_BY_BOSS[bossId]);
    }
  }
  if (UNEXPLORED_BOSS_IDS.every((bossId) => defeatedBosses.has(bossId))) {
    ids.push("defeat_all_personal_bosses");
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
