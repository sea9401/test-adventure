import {
  trainingGroundUpgradeForLevel,
  type TrainingGroundUpgradeDef,
} from "./settlement";
import type { V2Class } from "./classes";

export type GuildTrainingDrillId =
  | "basic_stance"
  | "weapon_flow"
  | "guard_breathing"
  | "arcane_control"
  | "shadow_footwork"
  | "recovery_camp"
  | "field_rotation"
  | "master_trial";

export type GuildTrainingDrillFocus =
  | "common"
  | Exclude<V2Class, "none">;

export type GuildTrainingDrillCategory =
  | "basic"
  | "specialized"
  | "field"
  | "advanced";

export type GuildTrainingState = {
  dayKey: string;
  claimed: GuildTrainingDrillId[];
};

export type GuildTrainingDrillDef = {
  id: GuildTrainingDrillId;
  title: string;
  desc: string;
  focus: GuildTrainingDrillFocus;
  category: GuildTrainingDrillCategory;
  minBuildingLevel: number;
  minCharacterLevel: number;
  baseMasteryReward: number;
  baseGoldReward: number;
};

export type GuildTrainingDrillView = GuildTrainingDrillDef & {
  claimed: boolean;
  available: boolean;
  lockedReason: string | null;
  focusLabel: string;
  categoryLabel: string;
  rewardMastery: number;
  rewardGold: number;
};

export const GUILD_TRAINING_FOCUS_LABEL: Record<
  GuildTrainingDrillFocus,
  string
> = {
  common: "공용",
  warrior: "전사",
  martial: "무도가",
  mage: "마법",
  rogue: "민첩",
  survivor: "회복",
};

export const GUILD_TRAINING_CATEGORY_LABEL: Record<
  GuildTrainingDrillCategory,
  string
> = {
  basic: "기초",
  specialized: "특화",
  field: "실전",
  advanced: "고급",
};

export const GUILD_TRAINING_DRILLS: Record<
  GuildTrainingDrillId,
  GuildTrainingDrillDef
> = {
  basic_stance: {
    id: "basic_stance",
    title: "기초 자세 훈련",
    desc: "현재 직업의 기본기를 반복 훈련합니다.",
    focus: "common",
    category: "basic",
    minBuildingLevel: 1,
    minCharacterLevel: 1,
    baseMasteryReward: 4,
    baseGoldReward: 300,
  },
  weapon_flow: {
    id: "weapon_flow",
    title: "무기 운용 훈련",
    desc: "공격 자세와 무기 교체 타이밍을 반복합니다.",
    focus: "warrior",
    category: "specialized",
    minBuildingLevel: 2,
    minCharacterLevel: 20,
    baseMasteryReward: 6,
    baseGoldReward: 500,
  },
  guard_breathing: {
    id: "guard_breathing",
    title: "방어 호흡 훈련",
    desc: "가드 유지와 회복 호흡을 맞춰 버티는 감각을 익힙니다.",
    focus: "martial",
    category: "specialized",
    minBuildingLevel: 2,
    minCharacterLevel: 20,
    baseMasteryReward: 6,
    baseGoldReward: 500,
  },
  arcane_control: {
    id: "arcane_control",
    title: "마력 제어 훈련",
    desc: "마력 흐름을 안정시켜 주문 운용 숙련도를 높입니다.",
    focus: "mage",
    category: "specialized",
    minBuildingLevel: 2,
    minCharacterLevel: 20,
    baseMasteryReward: 6,
    baseGoldReward: 500,
  },
  shadow_footwork: {
    id: "shadow_footwork",
    title: "그림자 보법 훈련",
    desc: "거리 조절과 빈틈 파악을 반복해 민첩 계열 감각을 다듬습니다.",
    focus: "rogue",
    category: "specialized",
    minBuildingLevel: 2,
    minCharacterLevel: 20,
    baseMasteryReward: 6,
    baseGoldReward: 500,
  },
  recovery_camp: {
    id: "recovery_camp",
    title: "야전 회복 훈련",
    desc: "전투 후 회복 루틴과 응급 처치 동선을 점검합니다.",
    focus: "survivor",
    category: "specialized",
    minBuildingLevel: 2,
    minCharacterLevel: 20,
    baseMasteryReward: 6,
    baseGoldReward: 500,
  },
  field_rotation: {
    id: "field_rotation",
    title: "실전 순환 훈련",
    desc: "전투 흐름을 짧게 복기해 숙련도를 보강합니다.",
    focus: "common",
    category: "field",
    minBuildingLevel: 3,
    minCharacterLevel: 50,
    baseMasteryReward: 8,
    baseGoldReward: 800,
  },
  master_trial: {
    id: "master_trial",
    title: "전직 대비 훈련",
    desc: "상위 전직을 바라보는 고강도 개인 훈련입니다.",
    focus: "common",
    category: "advanced",
    minBuildingLevel: 5,
    minCharacterLevel: 100,
    baseMasteryReward: 12,
    baseGoldReward: 1500,
  },
};

export const GUILD_TRAINING_DRILL_IDS: GuildTrainingDrillId[] = [
  "basic_stance",
  "weapon_flow",
  "guard_breathing",
  "arcane_control",
  "shadow_footwork",
  "recovery_camp",
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
  currentClass,
}: {
  state: GuildTrainingState;
  buildingLevel: number;
  characterLevel: number;
  hasJob: boolean;
  currentClass: V2Class;
}): GuildTrainingDrillView[] {
  const upgrade = trainingGroundUpgradeForLevel(Math.max(1, buildingLevel));
  const dailyClaimLimit = Math.max(1, upgrade.unlockedDrillCount);
  const claimedCount = state.claimed.length;
  return GUILD_TRAINING_DRILL_IDS.map((id) => {
    const drill = GUILD_TRAINING_DRILLS[id];
    const reward = guildTrainingReward(drill, upgrade);
    const claimed = state.claimed.includes(id);
    let lockedReason: string | null = null;
    if (buildingLevel < drill.minBuildingLevel) {
      lockedReason = `훈련장 Lv ${drill.minBuildingLevel} 필요`;
    } else if (!hasJob) {
      lockedReason = "전직 후 이용 가능";
    } else if (drill.focus !== "common" && drill.focus !== currentClass) {
      lockedReason = `${GUILD_TRAINING_FOCUS_LABEL[drill.focus]} 계열 전용`;
    } else if (characterLevel < drill.minCharacterLevel) {
      lockedReason = `캐릭터 Lv ${drill.minCharacterLevel} 필요`;
    } else if (claimed) {
      lockedReason = "오늘 완료";
    } else if (claimedCount >= dailyClaimLimit) {
      lockedReason = "오늘 훈련 횟수 소진";
    }
    return {
      ...drill,
      claimed,
      available: lockedReason == null,
      lockedReason,
      focusLabel: GUILD_TRAINING_FOCUS_LABEL[drill.focus],
      categoryLabel: GUILD_TRAINING_CATEGORY_LABEL[drill.category],
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
