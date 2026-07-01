import {
  trainingGroundUpgradeForLevel,
  type TrainingGroundUpgradeDef,
} from "./settlement";

export type GuildTrainingDrillId =
  | "basic_stance"
  | "field_rotation"
  | "master_trial";

export type GuildTrainingState = {
  dayKey: string;
  claimed: GuildTrainingDrillId[];
};

export type GuildTrainingDrillDef = {
  id: GuildTrainingDrillId;
  title: string;
  desc: string;
  minBuildingLevel: number;
  minCharacterLevel: number;
  baseMasteryReward: number;
  baseGoldReward: number;
};

export type GuildTrainingDrillView = GuildTrainingDrillDef & {
  claimed: boolean;
  available: boolean;
  lockedReason: string | null;
  rewardMastery: number;
  rewardGold: number;
};

export const GUILD_TRAINING_DRILLS: Record<
  GuildTrainingDrillId,
  GuildTrainingDrillDef
> = {
  basic_stance: {
    id: "basic_stance",
    title: "기초 자세 훈련",
    desc: "현재 직업의 기본기를 반복 훈련합니다.",
    minBuildingLevel: 1,
    minCharacterLevel: 1,
    baseMasteryReward: 3,
    baseGoldReward: 500,
  },
  field_rotation: {
    id: "field_rotation",
    title: "실전 순환 훈련",
    desc: "전투 흐름을 짧게 복기해 숙련도를 보강합니다.",
    minBuildingLevel: 3,
    minCharacterLevel: 50,
    baseMasteryReward: 6,
    baseGoldReward: 1200,
  },
  master_trial: {
    id: "master_trial",
    title: "전직 대비 훈련",
    desc: "상위 전직을 바라보는 고강도 개인 훈련입니다.",
    minBuildingLevel: 5,
    minCharacterLevel: 100,
    baseMasteryReward: 10,
    baseGoldReward: 2500,
  },
};

export const GUILD_TRAINING_DRILL_IDS: GuildTrainingDrillId[] = [
  "basic_stance",
  "field_rotation",
  "master_trial",
];

export function todayGuildTrainingKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isGuildTrainingDrillId(
  raw: unknown,
): raw is GuildTrainingDrillId {
  return (
    typeof raw === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_TRAINING_DRILLS, raw)
  );
}

export function parseGuildTrainingState(
  raw: unknown,
  dayKey: string,
): GuildTrainingState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { dayKey, claimed: [] };
  }
  const obj = raw as { dayKey?: unknown; claimed?: unknown };
  if (obj.dayKey !== dayKey) return { dayKey, claimed: [] };
  const claimed = Array.isArray(obj.claimed)
    ? obj.claimed.filter(isGuildTrainingDrillId)
    : [];
  return { dayKey, claimed: Array.from(new Set(claimed)) };
}

export function guildTrainingReward(
  drill: GuildTrainingDrillDef,
  upgrade: TrainingGroundUpgradeDef,
): { mastery: number; gold: number } {
  const mult = 1 + Math.max(0, upgrade.trainingRewardBonusPct) / 100;
  return {
    mastery: Math.max(1, Math.floor(drill.baseMasteryReward * mult)),
    gold: Math.max(0, Math.floor(drill.baseGoldReward * mult)),
  };
}

export function guildTrainingDrillViews({
  state,
  buildingLevel,
  characterLevel,
  hasJob,
}: {
  state: GuildTrainingState;
  buildingLevel: number;
  characterLevel: number;
  hasJob: boolean;
}): GuildTrainingDrillView[] {
  const upgrade = trainingGroundUpgradeForLevel(Math.max(1, buildingLevel));
  return GUILD_TRAINING_DRILL_IDS.map((id) => {
    const drill = GUILD_TRAINING_DRILLS[id];
    const reward = guildTrainingReward(drill, upgrade);
    const claimed = state.claimed.includes(id);
    let lockedReason: string | null = null;
    if (buildingLevel < drill.minBuildingLevel) {
      lockedReason = `훈련장 Lv ${drill.minBuildingLevel} 필요`;
    } else if (!hasJob) {
      lockedReason = "전직 후 이용 가능";
    } else if (characterLevel < drill.minCharacterLevel) {
      lockedReason = `캐릭터 Lv ${drill.minCharacterLevel} 필요`;
    } else if (claimed) {
      lockedReason = "오늘 완료";
    }
    return {
      ...drill,
      claimed,
      available: lockedReason == null,
      lockedReason,
      rewardMastery: reward.mastery,
      rewardGold: reward.gold,
    };
  });
}

export function claimGuildTrainingDrill(
  state: GuildTrainingState,
  drillId: GuildTrainingDrillId,
): GuildTrainingState {
  if (state.claimed.includes(drillId)) return state;
  return { ...state, claimed: [...state.claimed, drillId] };
}
