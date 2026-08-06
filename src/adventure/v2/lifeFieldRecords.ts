import {
  FISHING_SPOTS,
  type FishingSpotId,
} from "@/adventure/data/v2/fishingSpots";
import {
  WOODCUTTING_SPOTS,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  MINING_SPOTS,
  type MiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  LIFE_FIELD_ENVIRONMENTS,
  LIFE_FIELD_ENVIRONMENT_IDS,
  LIFE_FIELD_SPOT_IDS,
  type LifeFieldActivity,
  type LifeFieldEnvironmentId,
} from "@/adventure/data/v2/lifeFieldEnvironment";

export const LIFE_FIELD_RECORDS_KEY = "life-field-records.v1";
export const LIFE_FIELD_TRACE_REQUIRED_SUCCESSES = 3;
export const LIFE_FIELD_PROCESSED_SESSION_LIMIT = 80;
export const LIFE_FIELD_DISCOVERY_REWARD = {
  normal: { resource: 3, xp: 10 },
  rare: { resource: 8, xp: 25 },
} as const;

export function lifeFieldDiscoveryReward(rare: boolean) {
  return rare
    ? LIFE_FIELD_DISCOVERY_REWARD.rare
    : LIFE_FIELD_DISCOVERY_REWARD.normal;
}

export type LifeFieldDiscoveryId =
  | "fishing_migrating_school"
  | "fishing_drifted_relic"
  | "fishing_giant_shadow"
  | "woodcutting_resin_hollow"
  | "woodcutting_old_tree_hollow"
  | "woodcutting_ancient_tree"
  | "mining_hidden_vein"
  | "mining_crystal_cavity"
  | "mining_fossil_layer";

export type LifeFieldDiscovery = {
  id: LifeFieldDiscoveryId;
  activity: LifeFieldActivity;
  label: string;
  description: string;
  hint: string;
  rare: boolean;
  matchingEnvironmentId: LifeFieldEnvironmentId;
};

export const LIFE_FIELD_DISCOVERIES: Record<
  LifeFieldDiscoveryId,
  LifeFieldDiscovery
> = {
  fishing_migrating_school: {
    id: "fishing_migrating_school",
    activity: "fishing",
    label: "이동하는 대어 떼",
    description: "큰 물고기 무리가 일정한 방향으로 수면 아래를 지나갑니다.",
    hint: "활발한 어군이 머무는 낚시터에서 흔적을 찾아보세요.",
    rare: false,
    matchingEnvironmentId: "fishing_active_school",
  },
  fishing_drifted_relic: {
    id: "fishing_drifted_relic",
    activity: "fishing",
    label: "떠내려온 유실물",
    description: "먹이 활동이 활발한 물가에 오래된 유실물이 떠올랐습니다.",
    hint: "먹이 활동이 왕성한 낚시터에서 흔적을 찾아보세요.",
    rare: false,
    matchingEnvironmentId: "fishing_feeding_time",
  },
  fishing_giant_shadow: {
    id: "fishing_giant_shadow",
    activity: "fishing",
    label: "수면 아래 거대한 그림자",
    description: "잔잔한 수면 아래로 정체를 알 수 없는 거대한 그림자가 지나갑니다.",
    hint: "고요한 수면 아래를 오래 관찰해 보세요.",
    rare: true,
    matchingEnvironmentId: "fishing_calm_water",
  },
  woodcutting_resin_hollow: {
    id: "woodcutting_resin_hollow",
    activity: "woodcutting",
    label: "송진이 맺힌 수동",
    description: "울창한 숲의 나무 안쪽에서 진한 송진이 흐르는 수동을 찾았습니다.",
    hint: "나무가 울창하게 자란 숲을 살펴보세요.",
    rare: false,
    matchingEnvironmentId: "woodcutting_dense_growth",
  },
  woodcutting_old_tree_hollow: {
    id: "woodcutting_old_tree_hollow",
    activity: "woodcutting",
    label: "오래된 나무 구멍",
    description: "정돈된 작업로 곁에서 오래된 흔적이 남은 나무 구멍을 발견했습니다.",
    hint: "작업로가 잘 드러난 숲을 살펴보세요.",
    rare: false,
    matchingEnvironmentId: "woodcutting_clear_path",
  },
  woodcutting_ancient_tree: {
    id: "woodcutting_ancient_tree",
    activity: "woodcutting",
    label: "세월을 품은 고목",
    description: "수많은 계절을 나이테에 새긴 거대한 고목이 모습을 드러냈습니다.",
    hint: "선명한 나이테가 보이는 숲을 오래 조사해 보세요.",
    rare: true,
    matchingEnvironmentId: "woodcutting_clear_rings",
  },
  mining_hidden_vein: {
    id: "mining_hidden_vein",
    activity: "mining",
    label: "숨겨진 광맥",
    description: "드러난 광맥 뒤편에서 아직 손대지 않은 광석층을 찾았습니다.",
    hint: "광맥이 지표에 드러난 채광지를 살펴보세요.",
    rare: false,
    matchingEnvironmentId: "mining_exposed_vein",
  },
  mining_crystal_cavity: {
    id: "mining_crystal_cavity",
    activity: "mining",
    label: "결정 동공",
    description: "공명하는 결정으로 가득 찬 작은 공간이 암반 안에서 열렸습니다.",
    hint: "결정의 울림이 들리는 광맥을 조사해 보세요.",
    rare: false,
    matchingEnvironmentId: "mining_crystal_resonance",
  },
  mining_fossil_layer: {
    id: "mining_fossil_layer",
    activity: "mining",
    label: "고대 생물의 화석층",
    description: "안정된 암반 사이에서 오래전 생물의 흔적이 남은 화석층을 찾았습니다.",
    hint: "무너지지 않은 안정된 암반을 세심하게 살펴보세요.",
    rare: true,
    matchingEnvironmentId: "mining_stable_rock",
  },
};

export const LIFE_FIELD_DISCOVERY_IDS = Object.keys(
  LIFE_FIELD_DISCOVERIES,
) as LifeFieldDiscoveryId[];

export const LIFE_FIELD_DISCOVERY_IDS_BY_ACTIVITY: Record<
  LifeFieldActivity,
  readonly LifeFieldDiscoveryId[]
> = {
  fishing: LIFE_FIELD_DISCOVERY_IDS.filter(
    (id) => LIFE_FIELD_DISCOVERIES[id].activity === "fishing",
  ),
  woodcutting: LIFE_FIELD_DISCOVERY_IDS.filter(
    (id) => LIFE_FIELD_DISCOVERIES[id].activity === "woodcutting",
  ),
  mining: LIFE_FIELD_DISCOVERY_IDS.filter(
    (id) => LIFE_FIELD_DISCOVERIES[id].activity === "mining",
  ),
};

export const LIFE_FIELD_DISCOVERY_BALANCE: Record<
  LifeFieldActivity,
  {
    baseChance: number;
    dailyEvaluations: number;
    softPity: number;
    hardPity: number;
  }
> = {
  fishing: {
    baseChance: 0.0015,
    dailyEvaluations: 100,
    softPity: 400,
    hardPity: 800,
  },
  woodcutting: {
    baseChance: 0.0008,
    dailyEvaluations: 80,
    softPity: 500,
    hardPity: 1_000,
  },
  mining: {
    baseChance: 0.0008,
    dailyEvaluations: 80,
    softPity: 500,
    hardPity: 1_000,
  },
};

export type LifeFieldRecordKind = "region" | "environment" | "discovery";
export type LifeFieldRecordDefinition = {
  id: string;
  kind: LifeFieldRecordKind;
  activity: LifeFieldActivity;
  label: string;
  hint: string;
  href: string;
  rare: boolean;
};

export function lifeFieldRegionRecordId(
  activity: LifeFieldActivity,
  spotId: string,
) {
  return `region:${activity}:${spotId}`;
}

export function lifeFieldEnvironmentRecordId(id: LifeFieldEnvironmentId) {
  return `environment:${id}`;
}

export function lifeFieldDiscoveryRecordId(id: LifeFieldDiscoveryId) {
  return `discovery:${id}`;
}

function activityHref(activity: LifeFieldActivity, spotId: string) {
  if (activity === "fishing") return `/town/fishing?spot=${spotId}`;
  if (activity === "woodcutting") return `/town/logging?spot=${spotId}`;
  return `/town/mining?spot=${spotId}`;
}

function spotName(activity: LifeFieldActivity, spotId: string): string {
  if (activity === "fishing") {
    return FISHING_SPOTS[spotId as FishingSpotId]?.name ?? spotId;
  }
  if (activity === "woodcutting") {
    return WOODCUTTING_SPOTS[spotId as WoodcuttingSpotId]?.name ?? spotId;
  }
  return MINING_SPOTS[spotId as MiningSpotId]?.name ?? spotId;
}

export const LIFE_FIELD_RECORD_CATALOG: readonly LifeFieldRecordDefinition[] = [
  ...(Object.keys(LIFE_FIELD_SPOT_IDS) as LifeFieldActivity[]).flatMap(
    (activity) =>
      LIFE_FIELD_SPOT_IDS[activity].map((spotId) => ({
        id: lifeFieldRegionRecordId(activity, spotId),
        kind: "region" as const,
        activity,
        label: spotName(activity, spotId),
        hint: `${spotName(activity, spotId)}에서 생활 활동을 정상 완료하세요.`,
        href: activityHref(activity, spotId),
        rare: false,
      })),
  ),
  ...(Object.keys(LIFE_FIELD_ENVIRONMENT_IDS) as LifeFieldActivity[]).flatMap(
    (activity) =>
      LIFE_FIELD_ENVIRONMENT_IDS[activity].map((id) => ({
        id: lifeFieldEnvironmentRecordId(id),
        kind: "environment" as const,
        activity,
        label: LIFE_FIELD_ENVIRONMENTS[id].label,
        hint: `${LIFE_FIELD_ENVIRONMENTS[id].label} 환경에서 생활 활동을 정상 완료하세요.`,
        href:
          activity === "fishing"
            ? "/world-rumors?kind=fishing"
            : activity === "woodcutting"
              ? "/world-rumors?kind=woodcutting"
              : "/world-rumors?kind=mining",
        rare: false,
      })),
  ),
  ...LIFE_FIELD_DISCOVERY_IDS.map((id) => {
    const discovery = LIFE_FIELD_DISCOVERIES[id];
    return {
      id: lifeFieldDiscoveryRecordId(id),
      kind: "discovery" as const,
      activity: discovery.activity,
      label: discovery.label,
      hint: discovery.hint,
      href:
        discovery.activity === "fishing"
          ? "/town/fishing"
          : discovery.activity === "woodcutting"
            ? "/town/logging"
            : "/town/mining",
      rare: discovery.rare,
    };
  }),
];

export const LIFE_FIELD_BASIC_RECORD_TOTAL = LIFE_FIELD_RECORD_CATALOG.filter(
  (entry) => !entry.rare,
).length;
export const LIFE_FIELD_RARE_RECORD_TOTAL = LIFE_FIELD_RECORD_CATALOG.filter(
  (entry) => entry.rare,
).length;

export type LifeFieldRecordEntry = {
  count: number;
  firstAt: number;
  lastAt: number;
};

export type LifeFieldTrace = {
  discoveryId: LifeFieldDiscoveryId;
  activity: LifeFieldActivity;
  sourceId: string;
  environmentId: LifeFieldEnvironmentId;
  foundAt: number;
  progress: number;
};

export type LifeFieldDailyProgress = {
  dayKey: string;
  evaluated: number;
  found: boolean;
};

export type LifeFieldRecordsState = {
  version: 1;
  daily: Record<LifeFieldActivity, LifeFieldDailyProgress[]>;
  pity: Record<LifeFieldActivity, number>;
  traces: Partial<Record<LifeFieldActivity, LifeFieldTrace>>;
  records: Record<string, LifeFieldRecordEntry>;
  processedSessionIds: string[];
};

export function emptyLifeFieldRecordsState(): LifeFieldRecordsState {
  return {
    version: 1,
    daily: { fishing: [], woodcutting: [], mining: [] },
    pity: { fishing: 0, woodcutting: 0, mining: 0 },
    traces: {},
    records: {},
    processedSessionIds: [],
  };
}

function nonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseDaily(raw: unknown): LifeFieldDailyProgress[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      dayKey: typeof entry.dayKey === "string" ? entry.dayKey.slice(0, 10) : "",
      evaluated: nonNegativeInt(entry.evaluated),
      found: entry.found === true,
    }))
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.dayKey))
    .slice(-8);
}

function isDiscoveryId(value: unknown): value is LifeFieldDiscoveryId {
  return typeof value === "string" && value in LIFE_FIELD_DISCOVERIES;
}

function isEnvironmentId(value: unknown): value is LifeFieldEnvironmentId {
  return typeof value === "string" && value in LIFE_FIELD_ENVIRONMENTS;
}

export function parseLifeFieldRecordsState(raw: unknown): LifeFieldRecordsState {
  const empty = emptyLifeFieldRecordsState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const value = raw as Record<string, unknown>;
  const pityRaw = value.pity && typeof value.pity === "object"
    ? (value.pity as Record<string, unknown>)
    : {};
  const dailyRaw = value.daily && typeof value.daily === "object"
    ? (value.daily as Record<string, unknown>)
    : {};
  const tracesRaw = value.traces && typeof value.traces === "object"
    ? (value.traces as Record<string, unknown>)
    : {};
  const recordsRaw = value.records && typeof value.records === "object"
    ? (value.records as Record<string, unknown>)
    : {};
  const records: Record<string, LifeFieldRecordEntry> = {};
  const validRecordIds = new Set(LIFE_FIELD_RECORD_CATALOG.map((entry) => entry.id));
  for (const [id, recordRaw] of Object.entries(recordsRaw)) {
    if (!validRecordIds.has(id) || !recordRaw || typeof recordRaw !== "object") continue;
    const record = recordRaw as Record<string, unknown>;
    const count = nonNegativeInt(record.count);
    if (count <= 0) continue;
    records[id] = {
      count,
      firstAt: nonNegativeInt(record.firstAt),
      lastAt: nonNegativeInt(record.lastAt),
    };
  }
  const traces: LifeFieldRecordsState["traces"] = {};
  for (const activity of ["fishing", "woodcutting", "mining"] as const) {
    const traceRaw = tracesRaw[activity];
    if (!traceRaw || typeof traceRaw !== "object") continue;
    const trace = traceRaw as Record<string, unknown>;
    if (
      !isDiscoveryId(trace.discoveryId) ||
      LIFE_FIELD_DISCOVERIES[trace.discoveryId].activity !== activity ||
      typeof trace.sourceId !== "string" ||
      !isEnvironmentId(trace.environmentId)
    ) continue;
    traces[activity] = {
      discoveryId: trace.discoveryId,
      activity,
      sourceId: trace.sourceId,
      environmentId: trace.environmentId,
      foundAt: nonNegativeInt(trace.foundAt),
      progress: Math.min(
        LIFE_FIELD_TRACE_REQUIRED_SUCCESSES - 1,
        nonNegativeInt(trace.progress),
      ),
    };
  }
  return {
    version: 1,
    daily: {
      fishing: parseDaily(dailyRaw.fishing),
      woodcutting: parseDaily(dailyRaw.woodcutting),
      mining: parseDaily(dailyRaw.mining),
    },
    pity: {
      fishing: nonNegativeInt(pityRaw.fishing),
      woodcutting: nonNegativeInt(pityRaw.woodcutting),
      mining: nonNegativeInt(pityRaw.mining),
    },
    traces,
    records,
    processedSessionIds: Array.isArray(value.processedSessionIds)
      ? value.processedSessionIds
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .slice(-LIFE_FIELD_PROCESSED_SESSION_LIMIT)
      : [],
  };
}

function recordObservation(
  records: Record<string, LifeFieldRecordEntry>,
  id: string,
  count: number,
  now: number,
): { records: Record<string, LifeFieldRecordEntry>; added: boolean } {
  if (count <= 0) return { records, added: false };
  const current = records[id];
  return {
    records: {
      ...records,
      [id]: current
        ? { ...current, count: current.count + count, lastAt: now }
        : { count, firstAt: now, lastAt: now },
    },
    added: !current,
  };
}

function dailyProgress(
  rows: LifeFieldDailyProgress[],
  dayKey: string,
): LifeFieldDailyProgress {
  return rows.find((entry) => entry.dayKey === dayKey) ?? {
    dayKey,
    evaluated: 0,
    found: false,
  };
}

function replaceDailyProgress(
  rows: LifeFieldDailyProgress[],
  next: LifeFieldDailyProgress,
): LifeFieldDailyProgress[] {
  return [...rows.filter((entry) => entry.dayKey !== next.dayKey), next]
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
    .slice(-8);
}

function discoveryChance(
  activity: LifeFieldActivity,
  pity: number,
  matching: boolean,
): number {
  const balance = LIFE_FIELD_DISCOVERY_BALANCE[activity];
  const progress = Math.max(0, pity - balance.softPity);
  const span = Math.max(1, balance.hardPity - balance.softPity);
  const softMultiplier = pity < balance.softPity
    ? 1
    : 1 + 2 * Math.min(1, progress / span);
  return Math.min(
    1,
    balance.baseChance * softMultiplier * (matching ? 1.5 : 1),
  );
}

function pickDiscovery(
  activity: LifeFieldActivity,
  records: Record<string, LifeFieldRecordEntry>,
  rng: () => number,
): LifeFieldDiscovery {
  const ids = LIFE_FIELD_DISCOVERY_IDS_BY_ACTIVITY[activity];
  const rare = rng() < 0.05;
  const candidates = ids.filter((id) => LIFE_FIELD_DISCOVERIES[id].rare === rare);
  const weights = candidates.map((id) =>
    records[lifeFieldDiscoveryRecordId(id)] ? 1 : 2,
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = rng() * Math.max(1, total);
  for (let index = 0; index < candidates.length; index += 1) {
    if (roll < weights[index]) return LIFE_FIELD_DISCOVERIES[candidates[index]];
    roll -= weights[index];
  }
  return LIFE_FIELD_DISCOVERIES[candidates[candidates.length - 1] ?? ids[0]];
}

export type ApplyLifeFieldSuccessArgs = {
  activity: LifeFieldActivity;
  sourceId: string;
  environmentId: LifeFieldEnvironmentId;
  dayKey: string;
  now: number;
  sessionId: string;
  successes?: number;
  environmentsEnabled?: boolean;
  discoveriesEnabled?: boolean;
  rng?: () => number;
};

export type ApplyLifeFieldSuccessResult = {
  state: LifeFieldRecordsState;
  duplicate: boolean;
  newRecordIds: string[];
  foundTrace: LifeFieldTrace | null;
  completedTrace: LifeFieldTrace | null;
};

export function applyLifeFieldSuccess(
  rawState: LifeFieldRecordsState,
  args: ApplyLifeFieldSuccessArgs,
): ApplyLifeFieldSuccessResult {
  const state = parseLifeFieldRecordsState(rawState);
  if (!args.sessionId || state.processedSessionIds.includes(args.sessionId)) {
    return {
      state,
      duplicate: true,
      newRecordIds: [],
      foundTrace: null,
      completedTrace: null,
    };
  }
  const successes = Math.max(0, Math.floor(args.successes ?? 1));
  if (successes <= 0) {
    return {
      state,
      duplicate: false,
      newRecordIds: [],
      foundTrace: null,
      completedTrace: null,
    };
  }
  const rng = args.rng ?? Math.random;
  const newRecordIds: string[] = [];
  let records = state.records;
  const observationIds = [lifeFieldRegionRecordId(args.activity, args.sourceId)];
  if (args.environmentsEnabled !== false) {
    observationIds.push(lifeFieldEnvironmentRecordId(args.environmentId));
  }
  for (const recordId of observationIds) {
    const result = recordObservation(records, recordId, successes, args.now);
    records = result.records;
    if (result.added) newRecordIds.push(recordId);
  }

  const traces = { ...state.traces };
  const traceAtStart = traces[args.activity];
  let completedTrace: LifeFieldTrace | null = null;
  let foundTrace: LifeFieldTrace | null = null;
  let pity = state.pity[args.activity];
  let daily = dailyProgress(state.daily[args.activity], args.dayKey);

  if (traceAtStart) {
    if (traceAtStart.sourceId === args.sourceId) {
      const nextProgress = Math.min(
        LIFE_FIELD_TRACE_REQUIRED_SUCCESSES,
        traceAtStart.progress + successes,
      );
      if (nextProgress >= LIFE_FIELD_TRACE_REQUIRED_SUCCESSES) {
        completedTrace = { ...traceAtStart, progress: nextProgress };
        delete traces[args.activity];
        const discoveryRecordId = lifeFieldDiscoveryRecordId(
          traceAtStart.discoveryId,
        );
        const result = recordObservation(records, discoveryRecordId, 1, args.now);
        records = result.records;
        if (result.added) newRecordIds.push(discoveryRecordId);
      } else {
        traces[args.activity] = { ...traceAtStart, progress: nextProgress };
      }
    }
  } else if (args.discoveriesEnabled !== false && !daily.found) {
    const balance = LIFE_FIELD_DISCOVERY_BALANCE[args.activity];
    const remaining = Math.max(0, balance.dailyEvaluations - daily.evaluated);
    const evaluations = Math.min(successes, remaining);
    for (let index = 0; index < evaluations; index += 1) {
      const candidate = pickDiscovery(args.activity, records, rng);
      const nextPity = pity + 1;
      const forced = nextPity >= balance.hardPity;
      const chance = discoveryChance(
        args.activity,
        pity,
        args.environmentsEnabled !== false &&
          candidate.matchingEnvironmentId === args.environmentId,
      );
      daily = { ...daily, evaluated: daily.evaluated + 1 };
      if (forced || rng() < chance) {
        foundTrace = {
          discoveryId: candidate.id,
          activity: args.activity,
          sourceId: args.sourceId,
          environmentId: args.environmentId,
          foundAt: args.now,
          progress: 0,
        };
        traces[args.activity] = foundTrace;
        daily = { ...daily, found: true };
        pity = 0;
        break;
      }
      pity = nextPity;
    }
  }

  return {
    state: {
      ...state,
      daily: {
        ...state.daily,
        [args.activity]: replaceDailyProgress(
          state.daily[args.activity],
          daily,
        ),
      },
      pity: { ...state.pity, [args.activity]: pity },
      traces,
      records,
      processedSessionIds: [
        ...state.processedSessionIds.filter((id) => id !== args.sessionId),
        args.sessionId,
      ].slice(-LIFE_FIELD_PROCESSED_SESSION_LIMIT),
    },
    duplicate: false,
    newRecordIds,
    foundTrace,
    completedTrace,
  };
}

export function abandonLifeFieldTrace(
  rawState: unknown,
  activity: LifeFieldActivity,
): { state: LifeFieldRecordsState; abandoned: LifeFieldTrace | null } {
  const state = parseLifeFieldRecordsState(rawState);
  const abandoned = state.traces[activity] ?? null;
  if (!abandoned) return { state, abandoned: null };
  const traces = { ...state.traces };
  delete traces[activity];
  return { state: { ...state, traces }, abandoned };
}

export type LifeFieldRecordView = LifeFieldRecordDefinition & {
  discovered: boolean;
  count: number;
  firstAt: number | null;
  lastAt: number | null;
  medal: "gold" | "silver" | "bronze" | null;
};

export function lifeFieldRecordViews(rawState: unknown): LifeFieldRecordView[] {
  const state = parseLifeFieldRecordsState(rawState);
  return LIFE_FIELD_RECORD_CATALOG.map((definition) => {
    const record = state.records[definition.id];
    const count = record?.count ?? 0;
    return {
      ...definition,
      discovered: count > 0,
      count,
      firstAt: record?.firstAt ?? null,
      lastAt: record?.lastAt ?? null,
      medal:
        count >= 10
          ? "gold"
          : count >= 3
            ? "silver"
            : count >= 1
              ? "bronze"
              : null,
    };
  });
}

export function lifeFieldRecordSummary(rawState: unknown) {
  const entries = lifeFieldRecordViews(rawState);
  return {
    basic: {
      discovered: entries.filter((entry) => !entry.rare && entry.discovered).length,
      total: LIFE_FIELD_BASIC_RECORD_TOTAL,
    },
    rare: {
      discovered: entries.filter((entry) => entry.rare && entry.discovered).length,
      total: LIFE_FIELD_RARE_RECORD_TOTAL,
    },
    entries,
  };
}

export function lifeFieldDailyView(
  rawState: unknown,
  activity: LifeFieldActivity,
  dayKey: string,
) {
  const state = parseLifeFieldRecordsState(rawState);
  const daily = dailyProgress(state.daily[activity], dayKey);
  const balance = LIFE_FIELD_DISCOVERY_BALANCE[activity];
  return {
    evaluated: Math.min(daily.evaluated, balance.dailyEvaluations),
    limit: balance.dailyEvaluations,
    found: daily.found,
    pity: state.pity[activity],
    softPity: balance.softPity,
    hardPity: balance.hardPity,
    paused: Boolean(state.traces[activity]) || daily.found,
    trace: state.traces[activity] ?? null,
  };
}
