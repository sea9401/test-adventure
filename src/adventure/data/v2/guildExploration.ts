import {
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  type CoopRewardTier,
} from "./coopBosses";

export type GuildExplorationWeeklyMissionId = "weekly_coop_epic_30";

export type GuildExplorationWeeklyMetric = "coopBossTierClaims";

export type GuildExplorationWeeklyMission = {
  id: GuildExplorationWeeklyMissionId;
  title: string;
  metric: GuildExplorationWeeklyMetric;
  goal: number;
  minCoopTier: CoopRewardTier;
};

export const GUILD_EXPLORATION_COOP_MIN_TIER: CoopRewardTier = "epic";
export const GUILD_EXPLORATION_COOP_WEEKLY_TARGET = 30;

export const GUILD_EXPLORATION_WEEKLY_MISSIONS: Record<
  GuildExplorationWeeklyMissionId,
  GuildExplorationWeeklyMission
> = {
  weekly_coop_epic_30: {
    id: "weekly_coop_epic_30",
    title: `협동보스 ${COOP_TIER_LABEL[GUILD_EXPLORATION_COOP_MIN_TIER]} 이상 기여 ${GUILD_EXPLORATION_COOP_WEEKLY_TARGET}회`,
    metric: "coopBossTierClaims",
    goal: GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
    minCoopTier: GUILD_EXPLORATION_COOP_MIN_TIER,
  },
};

export const GUILD_EXPLORATION_WEEKLY_MISSION_IDS = Object.keys(
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
) as GuildExplorationWeeklyMissionId[];

export function coopTierMeetsExplorationRequirement(
  reached: CoopRewardTier | null | undefined,
  minTier: CoopRewardTier = GUILD_EXPLORATION_COOP_MIN_TIER,
): boolean {
  if (!reached) return false;
  return COOP_TIER_ORDER.indexOf(reached) >= COOP_TIER_ORDER.indexOf(minTier);
}
