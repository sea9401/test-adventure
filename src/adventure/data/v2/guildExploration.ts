import {
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  type CoopRewardTier,
} from "./coopBosses";

export type GuildExplorationWeeklyMissionId =
  | "weekly_coop_epic_30"
  | "weekly_hunt_win_500"
  | "weekly_fishing_catch_120"
  | "weekly_deep_hunt_win_100";

export type GuildExplorationWeeklyMetric =
  | "coopBossTierClaims"
  | "huntWins"
  | "deepHuntWins"
  | "fishingCatches";

export type GuildExplorationWeeklyMission = {
  id: GuildExplorationWeeklyMissionId;
  title: string;
  metric: GuildExplorationWeeklyMetric;
  goal: number;
  minCoopTier?: CoopRewardTier;
  rewardGold: number;
  rewardFame: number;
};

export type GuildExplorationWeeklyState = {
  weekKey: string;
  coopEpicProgress: number;
  huntWinProgress: number;
  deepHuntWinProgress: number;
  fishingCatchProgress: number;
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
    canClaim: boolean;
  };

export type GuildExplorationExpeditionId =
  | "ancient_ruins"
  | "mist_forest"
  | "sunken_archive";

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
};

export type GuildExplorationEventId =
  | "collapsed_bridge"
  | "ancient_device"
  | "abandoned_cache";

export type GuildExplorationEventChoiceId =
  | "safe_route"
  | "spend_supplies"
  | "study"
  | "salvage"
  | "secure"
  | "share";

export type GuildExplorationEventChoice = {
  id: GuildExplorationEventChoiceId;
  label: string;
  desc: string;
  rewardGold?: number;
  rewardFame?: number;
  mapFragments?: number;
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
  activeExpedition: GuildExplorationActiveExpedition | null;
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
export const GUILD_EXPLORATION_HUNT_WEEKLY_TARGET = 500;
export const GUILD_EXPLORATION_FISHING_WEEKLY_TARGET = 120;
export const GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH = 49;
export const GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET = 100;
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
    goal: GUILD_EXPLORATION_COOP_WEEKLY_TARGET,
    minCoopTier: GUILD_EXPLORATION_COOP_MIN_TIER,
    rewardGold: 5_000_000,
    rewardFame: 300,
  },
  weekly_hunt_win_500: {
    id: "weekly_hunt_win_500",
    title: `사냥 승리 ${GUILD_EXPLORATION_HUNT_WEEKLY_TARGET}회`,
    metric: "huntWins",
    goal: GUILD_EXPLORATION_HUNT_WEEKLY_TARGET,
    rewardGold: 3_000_000,
    rewardFame: 150,
  },
  weekly_fishing_catch_120: {
    id: "weekly_fishing_catch_120",
    title: `낚시 성공 ${GUILD_EXPLORATION_FISHING_WEEKLY_TARGET}회`,
    metric: "fishingCatches",
    goal: GUILD_EXPLORATION_FISHING_WEEKLY_TARGET,
    rewardGold: 2_000_000,
    rewardFame: 150,
  },
  weekly_deep_hunt_win_100: {
    id: "weekly_deep_hunt_win_100",
    title: `${GUILD_EXPLORATION_DEEP_HUNT_MIN_DEPTH}층 이상 사냥 승리 ${GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET}회`,
    metric: "deepHuntWins",
    goal: GUILD_EXPLORATION_DEEP_HUNT_WEEKLY_TARGET,
    rewardGold: 3_000_000,
    rewardFame: 150,
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
    durationMinutes: 60,
    costGold: 1_000_000,
    rewardGold: 1_400_000,
    rewardFame: 80,
    mapFragments: 24,
    minLevel: 1,
  },
  mist_forest: {
    id: "mist_forest",
    name: "안개 숲 수색",
    desc: "중거리 원정. 지도 조각 회수량이 높고 사건 발견에 유리합니다.",
    durationMinutes: 180,
    costGold: 2_500_000,
    rewardGold: 3_400_000,
    rewardFame: 180,
    mapFragments: 52,
    minLevel: 2,
  },
  sunken_archive: {
    id: "sunken_archive",
    name: "가라앉은 기록보관소",
    desc: "장거리 원정. 많은 지도 조각과 큰 길드 보상을 노립니다.",
    durationMinutes: 360,
    costGold: 5_000_000,
    rewardGold: 7_200_000,
    rewardFame: 420,
    mapFragments: 115,
    minLevel: 4,
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
        rewardFame: 120,
        mapFragments: 12,
      },
      {
        id: "spend_supplies",
        label: "가교 설치",
        desc: "빠르게 통로를 열어 회수품을 늘립니다.",
        rewardGold: 2_800_000,
        mapFragments: 24,
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
        desc: "길드 명성을 얻고 다음 탐사 단서를 확보합니다.",
        rewardFame: 260,
        mapFragments: 18,
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
        mapFragments: 10,
      },
      {
        id: "share",
        label: "단서 공유",
        desc: "보급품 안의 탐사 기록을 나눠 다음 지도를 앞당깁니다.",
        rewardFame: 160,
        mapFragments: 34,
      },
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
    activeExpedition: null,
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
  const active =
    obj.activeExpedition != null &&
    typeof obj.activeExpedition === "object" &&
    !Array.isArray(obj.activeExpedition)
      ? (obj.activeExpedition as Record<string, unknown>)
      : null;
  const activeExpedition =
    active && isGuildExplorationExpeditionId(active.expeditionId)
      ? {
          expeditionId: active.expeditionId,
          startedAt:
            typeof active.startedAt === "string" ? active.startedAt : "",
          endsAt: typeof active.endsAt === "string" ? active.endsAt : "",
        }
      : null;
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
    activeExpedition,
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
  return 0;
}

function fragmentGainForMetric(
  metric: GuildExplorationWeeklyMetric,
  count: number,
): number {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (safeCount <= 0) return 0;
  if (metric === "coopBossTierClaims") return safeCount * 8;
  if (metric === "deepHuntWins") return safeCount * 2;
  return safeCount;
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
  const withFragments = withMapFragments(
    state,
    fragmentGainForMetric(metric, count),
  );
  if (metric === "coopBossTierClaims") {
    return {
      ...withFragments,
      coopEpicProgress: withFragments.coopEpicProgress + amount,
    };
  }
  if (metric === "huntWins") {
    return {
      ...withFragments,
      huntWinProgress: withFragments.huntWinProgress + amount,
    };
  }
  if (metric === "fishingCatches") {
    return {
      ...withFragments,
      fishingCatchProgress: withFragments.fishingCatchProgress + amount,
    };
  }
  if (metric === "deepHuntWins") {
    return {
      ...withFragments,
      deepHuntWinProgress: withFragments.deepHuntWinProgress + amount,
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
  return { ...state, claimed: [...state.claimed, missionId] };
}

export function startGuildExplorationExpedition(
  state: GuildExplorationWeeklyState,
  expeditionId: GuildExplorationExpeditionId,
  now: Date,
): GuildExplorationWeeklyState {
  const def = GUILD_EXPLORATION_EXPEDITIONS[expeditionId];
  const startedAt = now.toISOString();
  const endsAt = new Date(
    now.getTime() + def.durationMinutes * 60_000,
  ).toISOString();
  return {
    ...state,
    content: {
      ...state.content,
      activeExpedition: { expeditionId, startedAt, endsAt },
    },
  };
}

export function claimGuildExplorationExpedition(
  state: GuildExplorationWeeklyState,
  now: Date,
):
  | { state: GuildExplorationWeeklyState; reward: GuildExplorationExpeditionReward }
  | null {
  const active = state.content.activeExpedition;
  if (!active) return null;
  const endsAt = new Date(active.endsAt).getTime();
  if (Number.isNaN(endsAt) || endsAt > now.getTime()) return null;
  const def = GUILD_EXPLORATION_EXPEDITIONS[active.expeditionId];
  const next = withMapFragments(
    {
      ...state,
      content: {
        ...state.content,
        activeExpedition: null,
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
): GuildExplorationWeeklyState | null {
  if (state.content.pendingEvent) return null;
  if (state.content.mapFragments < GUILD_EXPLORATION_MAP_FRAGMENT_TARGET) {
    return null;
  }
  const eventId =
    GUILD_EXPLORATION_EVENT_IDS[
      state.content.restoredMaps % GUILD_EXPLORATION_EVENT_IDS.length
    ];
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
  const next = withMapFragments(
    {
      ...state,
      content: {
        ...state.content,
        pendingEvent: null,
        resolvedEvents: [...state.content.resolvedEvents, event.id],
      },
    },
    choice.mapFragments ?? 0,
  );
  return { state: next, event, choice };
}
