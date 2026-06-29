export type GuildWorkshopWeeklyQuestId =
  | "weekly_craft_20"
  | "weekly_quality_3"
  | "weekly_craft_50";

export type GuildWorkshopWeeklyQuest = {
  id: GuildWorkshopWeeklyQuestId;
  title: string;
  metric: "crafts" | "qualityCrafts";
  goal: number;
  rewardGold: number;
  rewardFame: number;
};

export type GuildWorkshopWeeklyState = {
  weekKey: string;
  craftCount: number;
  qualityCount: number;
  claimed: GuildWorkshopWeeklyQuestId[];
};

export type GuildWorkshopWeeklyQuestView = GuildWorkshopWeeklyQuest & {
  progress: number;
  complete: boolean;
  claimed: boolean;
  canClaim: boolean;
};

export const GUILD_WORKSHOP_WEEKLY_QUESTS: Record<
  GuildWorkshopWeeklyQuestId,
  GuildWorkshopWeeklyQuest
> = {
  weekly_craft_20: {
    id: "weekly_craft_20",
    title: "주간 제작 20회",
    metric: "crafts",
    goal: 20,
    rewardGold: 300_000,
    rewardFame: 100,
  },
  weekly_quality_3: {
    id: "weekly_quality_3",
    title: "품질 제작 3회",
    metric: "qualityCrafts",
    goal: 3,
    rewardGold: 700_000,
    rewardFame: 250,
  },
  weekly_craft_50: {
    id: "weekly_craft_50",
    title: "주간 제작 50회",
    metric: "crafts",
    goal: 50,
    rewardGold: 1_500_000,
    rewardFame: 500,
  },
};

export const GUILD_WORKSHOP_WEEKLY_QUEST_IDS = Object.keys(
  GUILD_WORKSHOP_WEEKLY_QUESTS,
) as GuildWorkshopWeeklyQuestId[];

export function isGuildWorkshopWeeklyQuestId(
  v: unknown,
): v is GuildWorkshopWeeklyQuestId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_WORKSHOP_WEEKLY_QUESTS, v)
  );
}

export function parseGuildWorkshopWeeklyState(
  raw: unknown,
  currentWeekKey: string,
): GuildWorkshopWeeklyState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      weekKey: currentWeekKey,
      craftCount: 0,
      qualityCount: 0,
      claimed: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const weekKey =
    typeof obj.weekKey === "string" && obj.weekKey === currentWeekKey
      ? obj.weekKey
      : currentWeekKey;
  if (weekKey !== obj.weekKey) {
    return {
      weekKey,
      craftCount: 0,
      qualityCount: 0,
      claimed: [],
    };
  }
  const claimedRaw = Array.isArray(obj.claimed) ? obj.claimed : [];
  return {
    weekKey,
    craftCount: Math.max(0, Math.floor(Number(obj.craftCount) || 0)),
    qualityCount: Math.max(0, Math.floor(Number(obj.qualityCount) || 0)),
    claimed: claimedRaw.filter(isGuildWorkshopWeeklyQuestId),
  };
}

export function guildWorkshopWeeklyQuestViews(
  state: GuildWorkshopWeeklyState,
): GuildWorkshopWeeklyQuestView[] {
  return GUILD_WORKSHOP_WEEKLY_QUEST_IDS.map((id) => {
    const quest = GUILD_WORKSHOP_WEEKLY_QUESTS[id];
    const progress =
      quest.metric === "crafts" ? state.craftCount : state.qualityCount;
    const claimed = state.claimed.includes(id);
    const complete = progress >= quest.goal;
    return {
      ...quest,
      progress,
      complete,
      claimed,
      canClaim: complete && !claimed,
    };
  });
}

export function addGuildWorkshopWeeklyProgress(
  state: GuildWorkshopWeeklyState,
  qualityCrafted: boolean,
): GuildWorkshopWeeklyState {
  return {
    ...state,
    craftCount: state.craftCount + 1,
    qualityCount: state.qualityCount + (qualityCrafted ? 1 : 0),
  };
}

export function claimGuildWorkshopWeeklyQuest(
  state: GuildWorkshopWeeklyState,
  questId: GuildWorkshopWeeklyQuestId,
): GuildWorkshopWeeklyState {
  if (state.claimed.includes(questId)) return state;
  return { ...state, claimed: [...state.claimed, questId] };
}
