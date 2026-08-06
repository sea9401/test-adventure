import {
  GUILD_EXPLORATION_EXPEDITION_IDS,
  GUILD_EXPLORATION_EXPEDITIONS,
  GUILD_EXPLORATION_WEEKLY_MISSION_IDS,
  type GuildExplorationWeeklyMissionId,
} from "@/adventure/data/v2/guildExploration";
import {
  EXPLORATION_HQ_UPGRADES,
  explorationHqUpgradeForLevel,
  nextExplorationHqUpgrade,
} from "@/adventure/data/v2/settlement";

export type GuildExplorationNextUnlock = {
  level: number;
  expeditionNames: string[];
  currentWeeklyMissionCount: number;
  weeklyMissionCount: number;
  currentProgressBonusPct: number;
  progressBonusPct: number;
};

export function nextGuildExplorationUnlock(
  currentLevel: number,
): GuildExplorationNextUnlock | null {
  const current = explorationHqUpgradeForLevel(currentLevel);
  const next = nextExplorationHqUpgrade(currentLevel);
  if (!next) return null;

  return {
    level: next.level,
    expeditionNames: GUILD_EXPLORATION_EXPEDITION_IDS.filter(
      (id) => GUILD_EXPLORATION_EXPEDITIONS[id].minLevel === next.level,
    ).map((id) => GUILD_EXPLORATION_EXPEDITIONS[id].name),
    currentWeeklyMissionCount: current.weeklyMissionCount,
    weeklyMissionCount: next.weeklyMissionCount,
    currentProgressBonusPct: current.missionProgressBonusPct,
    progressBonusPct: next.missionProgressBonusPct,
  };
}

export function guildExplorationMissionUnlockLevel(
  missionId: GuildExplorationWeeklyMissionId,
): number | null {
  const missionIndex = GUILD_EXPLORATION_WEEKLY_MISSION_IDS.indexOf(missionId);
  if (missionIndex < 0) return null;
  return (
    EXPLORATION_HQ_UPGRADES.find(
      (upgrade) => upgrade.weeklyMissionCount > missionIndex,
    )?.level ?? null
  );
}
