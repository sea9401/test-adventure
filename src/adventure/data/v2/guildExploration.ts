import {
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  SUMMON_SCROLL_MATERIAL_ID,
  type CoopRewardTier,
} from "./coopBosses";
import type { GuildMemberGrantOutput } from "./guildMemberGrant";

export type GuildExplorationWeeklyMissionId =
  | "weekly_coop_epic_30"
  | "weekly_hunt_win_500"
  | "weekly_fishing_catch_120"
  | "weekly_woodcutting_success_80"
  | "weekly_farm_harvest_40"
  | "weekly_deep_hunt_win_100"
  | "weekly_raid_attack_60";

export type GuildExplorationWeeklyMetric =
  | "coopBossTierClaims"
  | "huntWins"
  | "deepHuntWins"
  | "fishingCatches"
  | "woodcuttingSuccesses"
  | "farmHarvests"
  | "raidAttacks";

export type GuildExplorationWeeklyMissionCategory = "combat" | "life";

export type GuildExplorationWeeklyMission = {
  id: GuildExplorationWeeklyMissionId;
  title: string;
  metric: GuildExplorationWeeklyMetric;
  category: GuildExplorationWeeklyMissionCategory;
  goal: number;
  minCoopTier?: CoopRewardTier;
  rewardGold: number;
  rewardMapFragments: number;
};

export type GuildExplorationWeeklyState = {
  weekKey: string;
  coopEpicProgress: number;
  huntWinProgress: number;
  deepHuntWinProgress: number;
  fishingCatchProgress: number;
  woodcuttingSuccessProgress: number;
  farmHarvestProgress: number;
  raidAttackProgress: number;
  claimed: GuildExplorationWeeklyMissionId[];
  content: GuildExplorationContentState;
};

export type GuildExplorationWeeklyMissionView =
  GuildExplorationWeeklyMission & {
    progress: number;
    progressText: string;
    goalProgress: number;
    complete: boolean;
    claimed: boolean;
    unlocked: boolean;
    canClaim: boolean;
  };

export type GuildExplorationExpeditionId =
  | "ancient_ruins"
  | "mist_forest"
  | "red_canyon"
  | "sunken_archive"
  | "starlight_citadel"
  | "frozen_peak"
  | "abyss_corridor";

export type GuildExplorationExpeditionDef = {
  id: GuildExplorationExpeditionId;
  name: string;
  desc: string;
  durationMinutes: number;
  costGold: number;
  rewardGold: number;
  rewardFame: number;
  mapFragments: number;
  minLevel: number;
  // 귀환 보상을 회수할 때 그 시점의 길드원 전원에게 주는 보상.
  memberReward?: GuildMemberGrantOutput;
  memberRewardName?: string;
};

export type GuildExplorationEventId =
  | "collapsed_bridge"
  | "ancient_device"
  | "abandoned_cache"
  | "sealed_library"
  | "starlit_altar"
  | "lost_caravan";

export type GuildExplorationEventChoiceId =
  | "safe_route"
  | "spend_supplies"
  | "study"
  | "salvage"
  | "secure"
  | "share"
  | "decode"
  | "sell_books"
  | "restore_altar"
  | "collect_offerings"
  | "secure_cargo"
  | "record_route";

export type GuildExplorationEventChoice = {
  id: GuildExplorationEventChoiceId;
  label: string;
  desc: string;
  rewardGold?: number;
  rewardFame?: number;
};

export type GuildExplorationEventDef = {
  id: GuildExplorationEventId;
  title: string;
  desc: string;
  choices: GuildExplorationEventChoice[];
};

export type GuildExplorationActiveExpedition = {
  expeditionId: GuildExplorationExpeditionId;
  startedAt: string;
  endsAt: string;
};

export type GuildExplorationPendingEvent = {
  eventId: GuildExplorationEventId;
};

export type GuildExplorationContentState = {
  mapFragments: number;
  restoredMaps: number;
  activeExpeditions: GuildExplorationActiveExpedition[];
  pendingEvent: GuildExplorationPendingEvent | null;
  resolvedEvents: GuildExplorationEventId[];
};

export type GuildExplorationExpeditionReward = {
  expeditionId: GuildExplorationExpeditionId;
  rewardGold: number;
  rewardFame: number;
  mapFragments: number;
};

export const GUILD_EXPLORATION_COOP_MIN_TIER: CoopRewardTier = "epic";
export const GUILD_EXPLORATION_COOP_WEEKLY_TARGET = 30;
export const GUILD_EXPLORATION_HUNT_WEEKLY_TARGET = 10_000;
export const GUILD_EXPLORATION_FISHING_WEEKLY_TARGET = 120;
export const GUILD_EXPLORATION_WOODCUTTING_WEEKLY_TARGET = 80;
export const GUILD_EXPLORATION_FARM_HARVEST_WEEKLY_TARGET = 40;
export const GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH = 49;
export const GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET = 2_500;
export const GUILD_EXPLORATION_RAID_ATTACK_WEEKLY_TARGET = 60;
export const GUILD_EXPLORATION_CONCURRENT_MIN_LEVEL = 8;
export const GUILD_EXPLORATION_FAST_EXPEDITION_MIN_LEVEL = 10;
export const GUILD_EXPLORATION_EXPANDED_EVENT_MIN_LEVEL = 10;
export const GUILD_EXPLORATION_PROGRESS_UNIT = 100;
export const GUILD_EXPLORATION_MAP_FRAGMENT_TARGET = 100;

export const GUILD_EXPLORATION_WEEKLY_MISSIONS: Record<
  GuildExplorationWeeklyMissionId,
  GuildExplorationWeeklyMission
> = {
  weekly_coop_epic_30: {
    id: "weekly_coop_epic_30",
    title: `협동보스 ${COOP_TIER_LABEL[GUILD_EXPLORATION_COOP_MIN_TIER]} 이상 기여 ${GUILD_EXPLORATION_COOP_WEEKLY_TARGET}회`,
    metric: "coopBossTierClaims",
    category: "combat",
    goal: GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
    minCoopTier: GUILD_EXPLORATION_COOP_MIN_TIER,
    rewardGold: 5_000_000,
    rewardMapFragments: 25,
  },
  weekly_hunt_win_500: {
    id: "weekly_hunt_win_500",
    title: `사냥 승리 ${GUILD_EXPLORATION_HUNT_WEEKLY_TARGET}회`,
    metric: "huntWins",
    category: "combat",
    goal: GUILD_EXPLORATION_HUNT_WEEKLY_TARGET,
    rewardGold: 3_000_000,
    rewardMapFragments: 25,
  },
  weekly_fishing_catch_120: {
    id: "weekly_fishing_catch_120",
    title: `낚시 성공 ${GUILD_EXPLORATION_FISHING_WEEKLY_TARGET}회`,
    metric: "fishingCatches",
    category: "life",
    goal: GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
    rewardGold: 2_000_000,
    rewardMapFragments: 25,
  },
  weekly_woodcutting_success_80: {
    id: "weekly_woodcutting_success_80",
    title: `벌목 성공 ${GUILD_EXPLORATION_WOODCUTTING_WEEKLY_TARGET}회`,
    metric: "woodcuttingSuccesses",
    category: "life",
    goal: GUILD_EXPLORATION_WOODCUTTING_WEEKLY_TARGET,
    rewardGold: 2_000_000,
    rewardMapFragments: 25,
  },
  weekly_farm_harvest_40: {
    id: "weekly_farm_harvest_40",
    title: `농장 수확 ${GUILD_EXPLORATION_FARM_HARVEST_WEEKLY_TARGET}회`,
    metric: "farmHarvests",
    category: "life",
    goal: GUILD_EXPLORATION_FARM_HARVEST_WEEKLY_TARGET,
    rewardGold: 2_000_000,
    rewardMapFragments: 25,
  },
  weekly_deep_hunt_win_100: {
    id: "weekly_deep_hunt_win_100",
    title: `${GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH}층 이상 사냥 승리 ${GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET}회`,
    metric: "deepHuntWins",
    category: "combat",
    goal: GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET,
    rewardGold: 3_000_000,
    rewardMapFragments: 25,
  },
  weekly_raid_attack_60: {
    id: "weekly_raid_attack_60",
    title: `길드 토벌전 유효 공격 ${GUILD_EXPLORATION_RAID_ATTACK_WEEKLY_TARGET}회`,
    metric: "raidAttacks",
    category: "combat",
    goal: GUILD_EXPLORATION_RAID_ATTACK_WEEKLY_TARGET,
    rewardGold: 4_000_000,
    rewardMapFragments: 30,
  },
};

export const GUILD_EXPLORATION_WEEKLY_MISSION_IDS = Object.keys(
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
) as GuildExplorationWeeklyMissionId[];

export const GUILD_EXPLORATION_EXPEDITIONS: Record<
  GuildExplorationExpeditionId,
  GuildExplorationExpeditionDef
> = {
  ancient_ruins: {
    id: "ancient_ruins",
    name: "고대 유적 답사",
    desc: "짧은 원정. 지도 조각과 소량의 명성을 안정적으로 회수합니다.",
    durationMinutes: 120,
    costGold: 500_000,
    rewardGold: 700_000,
    rewardFame: 20,
    mapFragments: 12,
    minLevel: 1,
  },
  mist_forest: {
    id: "mist_forest",
    name: "안개 숲 수색",
    desc: "중거리 원정. 지도 조각 회수량이 높고 사건 발견에 유리합니다.",
    durationMinutes: 240,
    costGold: 1_250_000,
    rewardGold: 1_700_000,
    rewardFame: 40,
    mapFragments: 24,
    minLevel: 2,
  },
  red_canyon: {
    id: "red_canyon",
    name: "붉은 협곡 정찰",
    desc: "중장기 원정. 험준한 협곡의 옛 보급로를 따라 탐사 기록과 명성을 회수합니다.",
    durationMinutes: 360,
    costGold: 1_800_000,
    rewardGold: 2_550_000,
    rewardFame: 65,
    mapFragments: 38,
    minLevel: 3,
  },
  sunken_archive: {
    id: "sunken_archive",
    name: "가라앉은 기록보관소",
    desc: "장거리 원정. 많은 지도 조각과 큰 길드 보상을 노립니다.",
    durationMinutes: 540,
    costGold: 2_500_000,
    rewardGold: 3_800_000,
    rewardFame: 95,
    mapFragments: 55,
    minLevel: 4,
  },
  starlight_citadel: {
    id: "starlight_citadel",
    name: "별빛 성채 대원정",
    desc: "최상급 장기 원정. 잊힌 성채의 중심부를 수색해 대량의 탐사 기록을 확보합니다.",
    durationMinutes: 720,
    costGold: 4_000_000,
    rewardGold: 6_000_000,
    rewardFame: 140,
    mapFragments: 80,
    minLevel: 5,
  },
  frozen_peak: {
    id: "frozen_peak",
    name: "얼어붙은 봉우리",
    desc: "고산 원정. 눈보라 속 옛 관측소를 수색하고 길드원에게 보급품을 나눕니다.",
    durationMinutes: 900,
    costGold: 6_000_000,
    rewardGold: 9_000_000,
    rewardFame: 200,
    mapFragments: 110,
    minLevel: 6,
    memberReward: { kind: "stamina_potion", count: 1 },
    memberRewardName: "스태미나 회복약 1개",
  },
  abyss_corridor: {
    id: "abyss_corridor",
    name: "심연 회랑",
    desc: "하루가 걸리는 심층 원정. 봉인된 회랑에서 보스 소환서를 찾아옵니다.",
    durationMinutes: 1440,
    costGold: 10_000_000,
    rewardGold: 15_000_000,
    rewardFame: 320,
    mapFragments: 170,
    minLevel: 9,
    memberReward: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 },
    memberRewardName: "보스 소환서 1장",
  },
};

export const GUILD_EXPLORATION_EXPEDITION_IDS = Object.keys(
  GUILD_EXPLORATION_EXPEDITIONS,
) as GuildExplorationExpeditionId[];

export const GUILD_EXPLORATION_EVENTS: Record<
  GuildExplorationEventId,
  GuildExplorationEventDef
> = {
  collapsed_bridge: {
    id: "collapsed_bridge",
    title: "무너진 다리",
    desc: "복원한 지도 끝에서 무너진 통로가 발견됐습니다. 길드가 접근 방식을 골라야 합니다.",
    choices: [
      {
        id: "safe_route",
        label: "우회로 확보",
        desc: "손실 없이 다음 탐사를 준비합니다.",
        rewardFame: 60,
      },
      {
        id: "spend_supplies",
        label: "가교 설치",
        desc: "빠르게 통로를 열어 회수품을 늘립니다.",
        rewardGold: 2_800_000,
      },
    ],
  },
  ancient_device: {
    id: "ancient_device",
    title: "고대 장치",
    desc: "작동 원리를 알 수 없는 장치가 발견됐습니다. 조사 방향에 따라 보상이 달라집니다.",
    choices: [
      {
        id: "study",
        label: "기록 해독",
        desc: "기록을 해독해 길드 명성을 얻습니다.",
        rewardFame: 130,
      },
      {
        id: "salvage",
        label: "부품 회수",
        desc: "보존된 부품을 길드 금고 수익으로 전환합니다.",
        rewardGold: 4_000_000,
      },
    ],
  },
  abandoned_cache: {
    id: "abandoned_cache",
    title: "버려진 보급품",
    desc: "오래된 보급 상자가 남아 있습니다. 즉시 확보하거나 길드원 전체에 나눌 수 있습니다.",
    choices: [
      {
        id: "secure",
        label: "금고로 회수",
        desc: "쓸 만한 물자를 정리해 길드 금고에 넣습니다.",
        rewardGold: 3_200_000,
      },
      {
        id: "share",
        label: "단서 공유",
        desc: "보급품 안의 탐사 기록을 나눠 길드 명성을 얻습니다.",
        rewardFame: 80,
      },
    ],
  },
  sealed_library: {
    id: "sealed_library",
    title: "봉인된 서고",
    desc: "지도 끝에서 오래 봉인된 서고가 발견됐습니다. 기록을 어떻게 다룰지 정해야 합니다.",
    choices: [
      { id: "decode", label: "기록 해독", desc: "남은 기록을 해독해 길드 명성을 얻습니다.", rewardFame: 200 },
      { id: "sell_books", label: "장서 매각", desc: "보존 상태가 좋은 장서를 팔아 금고에 넣습니다.", rewardGold: 6_000_000 },
    ],
  },
  starlit_altar: {
    id: "starlit_altar",
    title: "별빛 제단",
    desc: "별빛이 내려앉는 제단이 남아 있습니다. 복원하거나 공물을 회수할 수 있습니다.",
    choices: [
      { id: "restore_altar", label: "제단 복원", desc: "제단을 복원해 길드 명성을 얻습니다.", rewardFame: 250 },
      { id: "collect_offerings", label: "공물 회수", desc: "남은 공물을 정리해 금고에 넣습니다.", rewardGold: 7_000_000 },
    ],
  },
  lost_caravan: {
    id: "lost_caravan",
    title: "잊힌 상단 행렬",
    desc: "길을 잃은 상단의 마차 행렬이 발견됐습니다. 화물과 행로 중 하나를 챙길 수 있습니다.",
    choices: [
      { id: "secure_cargo", label: "화물 확보", desc: "남은 화물을 금고 수익으로 바꿉니다.", rewardGold: 6_500_000 },
      { id: "record_route", label: "행로 기록", desc: "상단의 행로를 기록해 길드 명성을 얻습니다.", rewardFame: 220 },
    ],
  },
};

export const GUILD_EXPLORATION_EVENT_IDS = Object.keys(
  GUILD_EXPLORATION_EVENTS,
) as GuildExplorationEventId[];

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

function asNonNegativeInt(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

export function isGuildExplorationExpeditionId(
  v: unknown,
): v is GuildExplorationExpeditionId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_EXPLORATION_EXPEDITIONS, v)
  );
}

function isGuildExplorationEventId(v: unknown): v is GuildExplorationEventId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_EXPLORATION_EVENTS, v)
  );
}

export function isGuildExplorationEventChoiceId(
  eventId: GuildExplorationEventId,
  choiceId: unknown,
): choiceId is GuildExplorationEventChoiceId {
  return (
    typeof choiceId === "string" &&
    GUILD_EXPLORATION_EVENTS[eventId].choices.some(
      (choice) => choice.id === choiceId,
    )
  );
}

function emptyExplorationContentState(): GuildExplorationContentState {
  return {
    mapFragments: 0,
    restoredMaps: 0,
    activeExpeditions: [],
    pendingEvent: null,
    resolvedEvents: [],
  };
}

export function parseGuildExplorationContentState(
  raw: unknown,
): GuildExplorationContentState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyExplorationContentState();
  }
  const obj = raw as Record<string, unknown>;
  // 2026-10 이전 저장값은 activeExpedition 단일 값이다. 배열로 읽어 진행 중인 원정을 보존한다.
  const rawActive: unknown[] = Array.isArray(obj.activeExpeditions)
    ? obj.activeExpeditions
    : obj.activeExpedition != null
      ? [obj.activeExpedition]
      : [];
  const activeExpeditions: GuildExplorationActiveExpedition[] = [];
  for (const item of rawActive) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const active = item as Record<string, unknown>;
    if (!isGuildExplorationExpeditionId(active.expeditionId)) continue;
    if (activeExpeditions.some((a) => a.expeditionId === active.expeditionId)) {
      continue;
    }
    activeExpeditions.push({
      expeditionId: active.expeditionId,
      startedAt: typeof active.startedAt === "string" ? active.startedAt : "",
      endsAt: typeof active.endsAt === "string" ? active.endsAt : "",
    });
  }
  const pending =
    obj.pendingEvent != null &&
    typeof obj.pendingEvent === "object" &&
    !Array.isArray(obj.pendingEvent)
      ? (obj.pendingEvent as Record<string, unknown>)
      : null;
  const pendingEvent =
    pending && isGuildExplorationEventId(pending.eventId)
      ? { eventId: pending.eventId }
      : null;
  return {
    mapFragments: asNonNegativeInt(obj.mapFragments),
    restoredMaps: asNonNegativeInt(obj.restoredMaps),
    activeExpeditions,
    pendingEvent,
    resolvedEvents: Array.isArray(obj.resolvedEvents)
      ? obj.resolvedEvents.filter(isGuildExplorationEventId)
      : [],
  };
}

function emptyExplorationWeeklyState(
  currentWeekKey: string,
): GuildExplorationWeeklyState {
  return {
    weekKey: currentWeekKey,
    coopEpicProgress: 0,
    huntWinProgress: 0,
    deepHuntWinProgress: 0,
    fishingCatchProgress: 0,
    woodcuttingSuccessProgress: 0,
    farmHarvestProgress: 0,
    raidAttackProgress: 0,
    claimed: [],
    content: emptyExplorationContentState(),
  };
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
    // 주간 진척은 초기화하지만, 금고 골드를 내고 보낸 원정은 주가 바뀌어도 귀환을 기다린다.
    const empty = emptyExplorationWeeklyState(weekKey);
    return {
      ...empty,
      content: {
        ...empty.content,
        activeExpeditions:
          parseGuildExplorationContentState(obj.content).activeExpeditions,
      },
    };
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
    huntWinProgress: Math.max(
      0,
      Math.floor(Number(obj.huntWinProgress) || 0),
    ),
    deepHuntWinProgress: Math.max(
      0,
      Math.floor(Number(obj.deepHuntWinProgress) || 0),
    ),
    fishingCatchProgress: Math.max(
      0,
      Math.floor(Number(obj.fishingCatchProgress) || 0),
    ),
    woodcuttingSuccessProgress: Math.max(
      0,
      Math.floor(Number(obj.woodcuttingSuccessProgress) || 0),
    ),
    farmHarvestProgress: Math.max(
      0,
      Math.floor(Number(obj.farmHarvestProgress) || 0),
    ),
    raidAttackProgress: Math.max(
      0,
      Math.floor(Number(obj.raidAttackProgress) || 0),
    ),
    claimed,
    content: parseGuildExplorationContentState(obj.content),
  };
}

export function guildExplorationWeeklyClaimedPayload(
  state: GuildExplorationWeeklyState,
): unknown {
  return state.claimed;
}

export function guildExplorationContentPayload(
  state: GuildExplorationWeeklyState,
): unknown {
  return state.content;
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
  if (metric === "huntWins") return state.huntWinProgress;
  if (metric === "deepHuntWins") return state.deepHuntWinProgress;
  if (metric === "fishingCatches") return state.fishingCatchProgress;
  if (metric === "woodcuttingSuccesses") {
    return state.woodcuttingSuccessProgress;
  }
  if (metric === "farmHarvests") return state.farmHarvestProgress;
  if (metric === "raidAttacks") return state.raidAttackProgress;
  return 0;
}

function withMapFragments(
  state: GuildExplorationWeeklyState,
  amount: number,
): GuildExplorationWeeklyState {
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (gain <= 0) return state;
  return {
    ...state,
    content: {
      ...state.content,
      mapFragments: state.content.mapFragments + gain,
    },
  };
}

export function guildExplorationWeeklyMissionViews(
  state: GuildExplorationWeeklyState,
  missionLimit: number,
): GuildExplorationWeeklyMissionView[] {
  const limit = Math.max(0, Math.floor(missionLimit));
  return GUILD_EXPLORATION_WEEKLY_MISSION_IDS.map((id, index) => {
    const mission = GUILD_EXPLORATION_WEEKLY_MISSIONS[id];
    const progress = progressForMetric(state, mission.metric);
    const goalProgress = mission.goal * GUILD_EXPLORATION_PROGRESS_UNIT;
    const claimed = state.claimed.includes(id);
    const complete = progress >= goalProgress;
    const unlocked = index < limit;
    return {
      ...mission,
      progress,
      progressText: progressText(Math.min(progress, goalProgress)),
      goalProgress,
      complete,
      claimed,
      unlocked,
      canClaim: unlocked && complete && !claimed,
    };
  });
}

export function addGuildExplorationProgress(
  state: GuildExplorationWeeklyState,
  metric: GuildExplorationWeeklyMetric,
  progressBonusPct: number,
  count = 1,
): GuildExplorationWeeklyState {
  const bonus = Math.max(0, Math.floor(Number(progressBonusPct) || 0));
  const amount =
    Math.max(0, Math.floor(Number(count) || 0)) *
    (GUILD_EXPLORATION_PROGRESS_UNIT + bonus);
  if (amount <= 0) return state;
  if (metric === "coopBossTierClaims") {
    return {
      ...state,
      coopEpicProgress: state.coopEpicProgress + amount,
    };
  }
  if (metric === "huntWins") {
    return {
      ...state,
      huntWinProgress: state.huntWinProgress + amount,
    };
  }
  if (metric === "fishingCatches") {
    return {
      ...state,
      fishingCatchProgress: state.fishingCatchProgress + amount,
    };
  }
  if (metric === "woodcuttingSuccesses") {
    return {
      ...state,
      woodcuttingSuccessProgress: state.woodcuttingSuccessProgress + amount,
    };
  }
  if (metric === "farmHarvests") {
    return {
      ...state,
      farmHarvestProgress: state.farmHarvestProgress + amount,
    };
  }
  if (metric === "deepHuntWins") {
    return {
      ...state,
      deepHuntWinProgress: state.deepHuntWinProgress + amount,
    };
  }
  if (metric === "raidAttacks") {
    return {
      ...state,
      raidAttackProgress: state.raidAttackProgress + amount,
    };
  }
  return state;
}

export function addGuildExplorationCoopProgress(
  state: GuildExplorationWeeklyState,
  progressBonusPct: number,
): GuildExplorationWeeklyState {
  return addGuildExplorationProgress(
    state,
    "coopBossTierClaims",
    progressBonusPct,
  );
}

export function claimGuildExplorationWeeklyMission(
  state: GuildExplorationWeeklyState,
  missionId: GuildExplorationWeeklyMissionId,
): GuildExplorationWeeklyState {
  if (state.claimed.includes(missionId)) return state;
  return withMapFragments(
    { ...state, claimed: [...state.claimed, missionId] },
    GUILD_EXPLORATION_WEEKLY_MISSIONS[missionId].rewardMapFragments,
  );
}

export function guildExplorationConcurrentLimit(level: number): number {
  return level >= GUILD_EXPLORATION_CONCURRENT_MIN_LEVEL ? 2 : 1;
}

export function guildExplorationDurationMinutes(
  def: GuildExplorationExpeditionDef,
  level: number,
): number {
  return level >= GUILD_EXPLORATION_FAST_EXPEDITION_MIN_LEVEL
    ? Math.round(def.durationMinutes * 0.9)
    : def.durationMinutes;
}

export function guildExplorationEventIdsForLevel(
  level: number,
): GuildExplorationEventId[] {
  return level >= GUILD_EXPLORATION_EXPANDED_EVENT_MIN_LEVEL
    ? GUILD_EXPLORATION_EVENT_IDS
    : GUILD_EXPLORATION_EVENT_IDS.slice(0, 3);
}

// 시설 레벨 미달, 같은 원정 중복, 동시 파견 한도 초과면 null.
export function startGuildExplorationExpedition(
  state: GuildExplorationWeeklyState,
  expeditionId: GuildExplorationExpeditionId,
  now: Date,
  level = 1,
): GuildExplorationWeeklyState | null {
  const def = GUILD_EXPLORATION_EXPEDITIONS[expeditionId];
  const active = state.content.activeExpeditions;
  if (
    level < def.minLevel ||
    active.some((item) => item.expeditionId === expeditionId) ||
    active.length >= guildExplorationConcurrentLimit(level)
  ) {
    return null;
  }
  const startedAt = now.toISOString();
  const endsAt = new Date(
    now.getTime() + guildExplorationDurationMinutes(def, level) * 60_000,
  ).toISOString();
  return {
    ...state,
    content: {
      ...state.content,
      activeExpeditions: [...active, { expeditionId, startedAt, endsAt }],
    },
  };
}

// expeditionId 를 주지 않으면 귀환한 원정 중 가장 먼저 끝난 것을 회수한다.
export function claimGuildExplorationExpedition(
  state: GuildExplorationWeeklyState,
  now: Date,
  expeditionId?: GuildExplorationExpeditionId,
):
  | { state: GuildExplorationWeeklyState; reward: GuildExplorationExpeditionReward }
  | null {
  const returned = state.content.activeExpeditions
    .filter((item) => {
      const endsAt = new Date(item.endsAt).getTime();
      return !Number.isNaN(endsAt) && endsAt <= now.getTime();
    })
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const active = expeditionId
    ? returned.find((item) => item.expeditionId === expeditionId)
    : returned[0];
  if (!active) return null;
  const def = GUILD_EXPLORATION_EXPEDITIONS[active.expeditionId];
  const next = withMapFragments(
    {
      ...state,
      content: {
        ...state.content,
        activeExpeditions: state.content.activeExpeditions.filter(
          (item) => item.expeditionId !== active.expeditionId,
        ),
      },
    },
    def.mapFragments,
  );
  return {
    state: next,
    reward: {
      expeditionId: def.id,
      rewardGold: def.rewardGold,
      rewardFame: def.rewardFame,
      mapFragments: def.mapFragments,
    },
  };
}

export function restoreGuildExplorationMap(
  state: GuildExplorationWeeklyState,
  level = 1,
): GuildExplorationWeeklyState | null {
  if (state.content.pendingEvent) return null;
  if (state.content.mapFragments < GUILD_EXPLORATION_MAP_FRAGMENT_TARGET) {
    return null;
  }
  const eventIds = guildExplorationEventIdsForLevel(level);
  const eventId = eventIds[state.content.restoredMaps % eventIds.length];
  return {
    ...state,
    content: {
      ...state.content,
      mapFragments:
        state.content.mapFragments - GUILD_EXPLORATION_MAP_FRAGMENT_TARGET,
      restoredMaps: state.content.restoredMaps + 1,
      pendingEvent: { eventId },
    },
  };
}

export function resolveGuildExplorationEvent(
  state: GuildExplorationWeeklyState,
  choiceId: GuildExplorationEventChoiceId,
):
  | {
      state: GuildExplorationWeeklyState;
      event: GuildExplorationEventDef;
      choice: GuildExplorationEventChoice;
    }
  | null {
  const pending = state.content.pendingEvent;
  if (!pending) return null;
  const event = GUILD_EXPLORATION_EVENTS[pending.eventId];
  const choice = event.choices.find((item) => item.id === choiceId);
  if (!choice) return null;
  const next = {
    ...state,
    content: {
      ...state.content,
      pendingEvent: null,
      resolvedEvents: [...state.content.resolvedEvents, event.id],
    },
  };
  return { state: next, event, choice };
}
