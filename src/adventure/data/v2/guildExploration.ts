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
  rewardGold: number;
  rewardFame: number;
};

export type GuildExplorationWeeklyState = {
  weekKey: string;
  coopEpicProgress: number;
  claimed: GuildExplorationWeeklyMissionId[];
};

export type GuildExplorationWeeklyMissionView =
  GuildExplorationWeeklyMission & {
    progress: number;
    progressText: string;
    goalProgress: number;
    complete: boolean;
    claimed: boolean;
    canClaim: boolean;
  };

export const GUILD_EXPLORATION_COOP_MIN_TIER: CoopRewardTier = "epic";
export const GUILD_EXPLORATION_COOP_WEEKLY_TARGET = 30;
export const GUILD_EXPLORATION_PROGRESS_UNIT = 100;

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
    rewardGold: 5_000_000,
    rewardFame: 300,
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

export function isGuildExplorationWeeklyMissionId(
  v: unknown,
): v is GuildExplorationWeeklyMissionId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_EXPLORATION_WEEKLY_MISSIONS, v)
  );
}

function emptyExplorationWeeklyState(
  currentWeekKey: string,
): GuildExplorationWeeklyState {
  return { weekKey: currentWeekKey, coopEpicProgress: 0, claimed: [] };
}

export function parseGuildExplorationWeeklyState(
  raw: unknown,
  currentWeekKey: string,
): GuildExplorationWeeklyState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyExplorationWeeklyState(currentWeekKey);
  }
  const obj = raw as Record<string, unknown>;
  const weekKey =
    typeof obj.weekKey === "string" && obj.weekKey === currentWeekKey
      ? obj.weekKey
      : currentWeekKey;
  if (weekKey !== obj.weekKey) {
    return emptyExplorationWeeklyState(weekKey);
  }
  const claimed = Array.isArray(obj.claimed)
    ? obj.claimed.filter(isGuildExplorationWeeklyMissionId)
    : [];
  return {
    weekKey,
    coopEpicProgress: Math.max(
      0,
      Math.floor(Number(obj.coopEpicProgress) || 0),
    ),
    claimed,
  };
}

export function guildExplorationWeeklyClaimedPayload(
  state: GuildExplorationWeeklyState,
): unknown {
  return state.claimed;
}

function progressText(progress: number): string {
  const whole = Math.floor(progress / GUILD_EXPLORATION_PROGRESS_UNIT);
  const rem = progress % GUILD_EXPLORATION_PROGRESS_UNIT;
  if (rem === 0) return `${whole}`;
  return (progress / GUILD_EXPLORATION_PROGRESS_UNIT)
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function progressForMetric(
  state: GuildExplorationWeeklyState,
  metric: GuildExplorationWeeklyMetric,
): number {
  if (metric === "coopBossTierClaims") return state.coopEpicProgress;
  return 0;
}

export function guildExplorationWeeklyMissionViews(
  state: GuildExplorationWeeklyState,
  missionLimit: number,
): GuildExplorationWeeklyMissionView[] {
  const limit = Math.max(0, Math.floor(missionLimit));
  return GUILD_EXPLORATION_WEEKLY_MISSION_IDS.slice(0, limit).map((id) => {
    const mission = GUILD_EXPLORATION_WEEKLY_MISSIONS[id];
    const progress = progressForMetric(state, mission.metric);
    const goalProgress = mission.goal * GUILD_EXPLORATION_PROGRESS_UNIT;
    const claimed = state.claimed.includes(id);
    const complete = progress >= goalProgress;
    return {
      ...mission,
      progress,
      progressText: progressText(Math.min(progress, goalProgress)),
      goalProgress,
      complete,
      claimed,
      canClaim: complete && !claimed,
    };
  });
}

export function addGuildExplorationCoopProgress(
  state: GuildExplorationWeeklyState,
  progressBonusPct: number,
): GuildExplorationWeeklyState {
  const bonus = Math.max(0, Math.floor(Number(progressBonusPct) || 0));
  return {
    ...state,
    coopEpicProgress:
      state.coopEpicProgress + GUILD_EXPLORATION_PROGRESS_UNIT + bonus,
  };
}

export function claimGuildExplorationWeeklyMission(
  state: GuildExplorationWeeklyState,
  missionId: GuildExplorationWeeklyMissionId,
): GuildExplorationWeeklyState {
  if (state.claimed.includes(missionId)) return state;
  return { ...state, claimed: [...state.claimed, missionId] };
}
