export type GuildWorkshopWeeklyQuestId =
  | "weekly_craft_20"
  | "weekly_quality_3"
  | "weekly_weapon_10"
  | "weekly_armor_10"
  | "weekly_craft_only_3"
  | "weekly_masterwork_2"
  | "weekly_high_tier_5"
  | "weekly_craft_50";

export type GuildWorkshopWeeklyMetric =
  | "crafts"
  | "qualityCrafts"
  | "weaponCrafts"
  | "armorCrafts"
  | "craftOnlyCrafts"
  | "masterworkCrafts"
  | "highTierCrafts";

export type GuildWorkshopWeeklyQuest = {
  id: GuildWorkshopWeeklyQuestId;
  title: string;
  metric: GuildWorkshopWeeklyMetric;
  goal: number;
  rewardGold: number;
  rewardFame: number;
};

export type GuildWorkshopWeeklyState = {
  weekKey: string;
  craftCount: number;
  qualityCount: number;
  weaponCount: number;
  armorCount: number;
  craftOnlyCount: number;
  masterworkCount: number;
  highTierCount: number;
  claimed: GuildWorkshopWeeklyQuestId[];
};

export type GuildWorkshopWeeklyProgressInput =
  | boolean
  | {
      qualityCrafted?: boolean;
      slot?: string;
      craftOnly?: boolean;
      masterwork?: boolean;
      tier?: number;
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
  weekly_weapon_10: {
    id: "weekly_weapon_10",
    title: "무기 제작 10회",
    metric: "weaponCrafts",
    goal: 10,
    rewardGold: 500_000,
    rewardFame: 180,
  },
  weekly_armor_10: {
    id: "weekly_armor_10",
    title: "방어구 제작 10회",
    metric: "armorCrafts",
    goal: 10,
    rewardGold: 500_000,
    rewardFame: 180,
  },
  weekly_craft_only_3: {
    id: "weekly_craft_only_3",
    title: "전용 장비 제작 3회",
    metric: "craftOnlyCrafts",
    goal: 3,
    rewardGold: 900_000,
    rewardFame: 320,
  },
  weekly_masterwork_2: {
    id: "weekly_masterwork_2",
    title: "명장 제작 2회",
    metric: "masterworkCrafts",
    goal: 2,
    rewardGold: 1_100_000,
    rewardFame: 380,
  },
  weekly_high_tier_5: {
    id: "weekly_high_tier_5",
    title: "T8 이상 제작 5회",
    metric: "highTierCrafts",
    goal: 5,
    rewardGold: 1_200_000,
    rewardFame: 420,
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

export const GUILD_WORKSHOP_WEEKLY_REWARD_CAP = {
  gold: 7_000_000,
  fame: 2_500,
} as const;

export function isGuildWorkshopWeeklyQuestId(
  v: unknown,
): v is GuildWorkshopWeeklyQuestId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_WORKSHOP_WEEKLY_QUESTS, v)
  );
}

function emptyWeeklyState(currentWeekKey: string): GuildWorkshopWeeklyState {
  return {
    weekKey: currentWeekKey,
    craftCount: 0,
    qualityCount: 0,
    weaponCount: 0,
    armorCount: 0,
    craftOnlyCount: 0,
    masterworkCount: 0,
    highTierCount: 0,
    claimed: [],
  };
}

function parseClaimedPayload(raw: unknown): {
  claimed: GuildWorkshopWeeklyQuestId[];
  extra: Partial<
    Pick<
      GuildWorkshopWeeklyState,
      | "weaponCount"
      | "armorCount"
      | "craftOnlyCount"
      | "masterworkCount"
      | "highTierCount"
    >
  >;
} {
  if (Array.isArray(raw)) {
    return { claimed: raw.filter(isGuildWorkshopWeeklyQuestId), extra: {} };
  }
  if (raw == null || typeof raw !== "object") {
    return { claimed: [], extra: {} };
  }
  const obj = raw as Record<string, unknown>;
  const claimedRaw = Array.isArray(obj.ids) ? obj.ids : obj.claimed;
  const claimed = Array.isArray(claimedRaw)
    ? claimedRaw.filter(isGuildWorkshopWeeklyQuestId)
    : [];
  const n = (key: string) => Math.max(0, Math.floor(Number(obj[key]) || 0));
  return {
    claimed,
    extra: {
      weaponCount: n("weaponCount"),
      armorCount: n("armorCount"),
      craftOnlyCount: n("craftOnlyCount"),
      masterworkCount: n("masterworkCount"),
      highTierCount: n("highTierCount"),
    },
  };
}

export function guildWorkshopWeeklyClaimedPayload(
  state: GuildWorkshopWeeklyState,
): unknown {
  return {
    ids: state.claimed,
    weaponCount: state.weaponCount,
    armorCount: state.armorCount,
    craftOnlyCount: state.craftOnlyCount,
    masterworkCount: state.masterworkCount,
    highTierCount: state.highTierCount,
  };
}

export function parseGuildWorkshopWeeklyState(
  raw: unknown,
  currentWeekKey: string,
): GuildWorkshopWeeklyState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyWeeklyState(currentWeekKey);
  }
  const obj = raw as Record<string, unknown>;
  const weekKey =
    typeof obj.weekKey === "string" && obj.weekKey === currentWeekKey
      ? obj.weekKey
      : currentWeekKey;
  if (weekKey !== obj.weekKey) {
    return emptyWeeklyState(weekKey);
  }
  const { claimed, extra } = parseClaimedPayload(obj.claimed);
  return {
    weekKey,
    craftCount: Math.max(0, Math.floor(Number(obj.craftCount) || 0)),
    qualityCount: Math.max(0, Math.floor(Number(obj.qualityCount) || 0)),
    weaponCount: extra.weaponCount ?? 0,
    armorCount: extra.armorCount ?? 0,
    craftOnlyCount: extra.craftOnlyCount ?? 0,
    masterworkCount: extra.masterworkCount ?? 0,
    highTierCount: extra.highTierCount ?? 0,
    claimed,
  };
}

function weeklyProgressForMetric(
  state: GuildWorkshopWeeklyState,
  metric: GuildWorkshopWeeklyMetric,
): number {
  if (metric === "crafts") return state.craftCount;
  if (metric === "qualityCrafts") return state.qualityCount;
  if (metric === "weaponCrafts") return state.weaponCount;
  if (metric === "armorCrafts") return state.armorCount;
  if (metric === "craftOnlyCrafts") return state.craftOnlyCount;
  if (metric === "masterworkCrafts") return state.masterworkCount;
  return state.highTierCount;
}

export function guildWorkshopWeeklyQuestViews(
  state: GuildWorkshopWeeklyState,
): GuildWorkshopWeeklyQuestView[] {
  return GUILD_WORKSHOP_WEEKLY_QUEST_IDS.map((id) => {
    const quest = GUILD_WORKSHOP_WEEKLY_QUESTS[id];
    const progress = weeklyProgressForMetric(state, quest.metric);
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

export function guildWorkshopWeeklyRewardTotals(): {
  gold: number;
  fame: number;
} {
  return GUILD_WORKSHOP_WEEKLY_QUEST_IDS.reduce(
    (sum, id) => {
      const quest = GUILD_WORKSHOP_WEEKLY_QUESTS[id];
      return {
        gold: sum.gold + quest.rewardGold,
        fame: sum.fame + quest.rewardFame,
      };
    },
    { gold: 0, fame: 0 },
  );
}

export function addGuildWorkshopWeeklyProgress(
  state: GuildWorkshopWeeklyState,
  input: GuildWorkshopWeeklyProgressInput,
): GuildWorkshopWeeklyState {
  const event = typeof input === "boolean" ? { qualityCrafted: input } : input;
  const slot = String(event.slot ?? "");
  const armorSlot = slot === "armor" || slot === "gloves" || slot === "boots";
  const tier = Math.max(0, Math.floor(Number(event.tier) || 0));
  return {
    ...state,
    craftCount: state.craftCount + 1,
    qualityCount: state.qualityCount + (event.qualityCrafted ? 1 : 0),
    weaponCount: state.weaponCount + (slot === "weapon" ? 1 : 0),
    armorCount: state.armorCount + (armorSlot ? 1 : 0),
    craftOnlyCount: state.craftOnlyCount + (event.craftOnly ? 1 : 0),
    masterworkCount: state.masterworkCount + (event.masterwork ? 1 : 0),
    highTierCount: state.highTierCount + (tier >= 8 ? 1 : 0),
  };
}

export function claimGuildWorkshopWeeklyQuest(
  state: GuildWorkshopWeeklyState,
  questId: GuildWorkshopWeeklyQuestId,
): GuildWorkshopWeeklyState {
  if (state.claimed.includes(questId)) return state;
  return { ...state, claimed: [...state.claimed, questId] };
}
