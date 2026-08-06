import {
  WOODCUTTING_SPOTS,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  MINING_SPOTS,
  type MiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  isLifeFieldEnvironmentId,
  type LifeFieldEnvironmentId,
} from "@/adventure/data/v2/lifeFieldEnvironment";

export const AUTO_GATHERING_DURATION_MS = 30 * 60 * 1_000;
export const AUTO_GATHERING_MATERIAL_EFFICIENCY = 0.8;
export const AUTO_GATHERING_XP_EFFICIENCY = 0.7;
export type AutoGatheringPlanId = "standard" | "extended";
export type AutoGatheringPlan = {
  id: AutoGatheringPlanId;
  label: string;
  durationLabel: string;
  durationMs: number;
  materialEfficiency: number;
  successRateMultiplier: number;
  xpEfficiency: number;
};
export const AUTO_GATHERING_PLANS: Record<
  AutoGatheringPlanId,
  AutoGatheringPlan
> = {
  standard: {
    id: "standard",
    label: "기본 작업",
    durationLabel: "30분",
    durationMs: AUTO_GATHERING_DURATION_MS,
    materialEfficiency: AUTO_GATHERING_MATERIAL_EFFICIENCY,
    successRateMultiplier: 1,
    xpEfficiency: AUTO_GATHERING_XP_EFFICIENCY,
  },
  extended: {
    id: "extended",
    label: "느긋한 작업",
    durationLabel: "2시간",
    durationMs: 2 * 60 * 60 * 1_000,
    materialEfficiency: 0.6,
    successRateMultiplier: 0.8,
    xpEfficiency: AUTO_GATHERING_XP_EFFICIENCY,
  },
};
export const AUTO_GATHERING_PLAN_LIST = Object.values(AUTO_GATHERING_PLANS);
export const WOODCUTTING_AUTO_KEY = "woodcutting-auto.v1";
export const MINING_AUTO_KEY = "mining-auto.v1";

export type AutoGatheringActivity = "woodcutting" | "mining";

export type AutoGatheringStatus = {
  activity: AutoGatheringActivity;
  sourceId: string;
  sourceName: string;
  readyAt: number;
};

function woodcuttingSpotIdForSource(sourceId: string): WoodcuttingSpotId | null {
  return (
    (Object.values(WOODCUTTING_SPOTS).find(
      (spot) => spot.treeId === sourceId,
    )?.id as WoodcuttingSpotId | undefined) ?? null
  );
}

function miningSpotIdForSource(sourceId: string): MiningSpotId | null {
  return (
    (Object.values(MINING_SPOTS).find(
      (spot) => spot.nodeId === sourceId,
    )?.id as MiningSpotId | undefined) ?? null
  );
}

export function autoGatheringActivityHref(
  status: AutoGatheringStatus | null,
): string | null {
  if (!status) return null;
  if (status.activity === "woodcutting") {
    const spotId = woodcuttingSpotIdForSource(status.sourceId);
    return spotId ? `/town/logging?spot=${spotId}` : "/town/logging";
  }
  const spotId = miningSpotIdForSource(status.sourceId);
  return spotId ? `/town/mining?spot=${spotId}` : "/town/mining";
}

export function autoGatheringStatusText(
  status: AutoGatheringStatus | null,
  now: number,
): string {
  if (!status) return "휴식 중";
  const activityName = status.activity === "woodcutting" ? "벌목" : "채광";
  if (now >= status.readyAt) {
    return `${activityName} 정산 대기 · ${status.sourceName}`;
  }
  const remainingSeconds = Math.max(
    0,
    Math.ceil((status.readyAt - now) / 1_000),
  );
  const hours = Math.floor(remainingSeconds / 3_600);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const remainingLabel =
    hours > 0
      ? `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${activityName} 자동 중 · ${status.sourceName} · ${remainingLabel}`;
}

export type AutoGatheringSession = {
  sessionId: string;
  planId: AutoGatheringPlanId;
  sourceId: string;
  sourceName: string;
  materialId: string;
  startedAt: number;
  readyAt: number;
  cycleDurationMs: number;
  attempts: number;
  successRate: number;
  materialEfficiency: number;
  xpEfficiency: number;
  bonusMaterialRate: number;
  baseXp: number;
  aidItemId?: string;
  aidBonusMaterialRate?: number;
  aidByproductMultiplier?: number;
  spotId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
  environmentPrimaryBonusChance?: number;
  environmentXpBonusPct?: number;
  environmentByproductMultiplier?: number;
};

export type AutoGatheringRemainders = {
  successes: Record<string, number>;
  materials: Record<string, number>;
  xp: number;
  mastery: number;
};

export type AutoGatheringState = {
  session: AutoGatheringSession | null;
  remainders: AutoGatheringRemainders;
};

const EMPTY_REMAINDERS: AutoGatheringRemainders = {
  successes: {},
  materials: {},
  xp: 0,
  mastery: 0,
};

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unitRemainder(value: unknown): number {
  return Math.min(0.999_999, Math.max(0, finiteNumber(value)));
}

function remainderMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key.length > 0)
      .map(([key, remainder]) => [key, unitRemainder(remainder)]),
  );
}

export function isAutoGatheringPlanId(
  value: unknown,
): value is AutoGatheringPlanId {
  return value === "standard" || value === "extended";
}

export function autoGatheringPlan(value: unknown): AutoGatheringPlan {
  return AUTO_GATHERING_PLANS[
    isAutoGatheringPlanId(value) ? value : "standard"
  ];
}

export function autoGatheringAttempts(
  cycleDurationMs: number,
  durationMs = AUTO_GATHERING_DURATION_MS,
): number {
  const safeCycleDurationMs = Math.max(
    1_000,
    Math.floor(finiteNumber(cycleDurationMs, 1_000)),
  );
  const safeDurationMs = Math.max(
    60_000,
    Math.floor(finiteNumber(durationMs, AUTO_GATHERING_DURATION_MS)),
  );
  return Math.max(1, Math.floor(safeDurationMs / safeCycleDurationMs));
}

export function createAutoGatheringSession(args: {
  sessionId: string;
  sourceId: string;
  sourceName: string;
  materialId: string;
  planId?: AutoGatheringPlanId;
  now: number;
  cycleDurationMs: number;
  successRate: number;
  bonusMaterialRate?: number;
  baseXp: number;
  aidItemId?: string;
  aidBonusMaterialRate?: number;
  aidByproductMultiplier?: number;
  spotId?: string;
  lifeEnvironmentId?: LifeFieldEnvironmentId;
  lifeEnvironmentDayKey?: string;
  environmentPrimaryBonusChance?: number;
  environmentXpBonusPct?: number;
  environmentByproductMultiplier?: number;
}): AutoGatheringSession {
  const plan = autoGatheringPlan(args.planId);
  const cycleDurationMs = Math.max(
    1_000,
    Math.floor(finiteNumber(args.cycleDurationMs, 1_000)),
  );
  const successRate = Math.min(
    1,
    Math.max(0, finiteNumber(args.successRate) * plan.successRateMultiplier),
  );
  return {
    sessionId: args.sessionId,
    planId: plan.id,
    sourceId: args.sourceId,
    sourceName: args.sourceName,
    materialId: args.materialId,
    startedAt: args.now,
    readyAt: args.now + plan.durationMs,
    cycleDurationMs,
    attempts: autoGatheringAttempts(cycleDurationMs, plan.durationMs),
    successRate: Math.round(successRate * 1_000_000) / 1_000_000,
    materialEfficiency: plan.materialEfficiency,
    xpEfficiency: plan.xpEfficiency,
    bonusMaterialRate: Math.min(
      1,
      Math.max(0, finiteNumber(args.bonusMaterialRate)),
    ),
    baseXp: Math.max(0, Math.floor(finiteNumber(args.baseXp))),
    ...(args.aidItemId ? { aidItemId: args.aidItemId, aidBonusMaterialRate: Math.min(1, Math.max(0, finiteNumber(args.aidBonusMaterialRate))), aidByproductMultiplier: Math.max(1, finiteNumber(args.aidByproductMultiplier, 1)) } : {}),
    ...(args.spotId ? { spotId: args.spotId } : {}),
    ...(args.lifeEnvironmentId
      ? {
          lifeEnvironmentId: args.lifeEnvironmentId,
          lifeEnvironmentDayKey: args.lifeEnvironmentDayKey,
          environmentPrimaryBonusChance: Math.min(
            1,
            Math.max(0, finiteNumber(args.environmentPrimaryBonusChance)),
          ),
          environmentXpBonusPct: Math.min(
            100,
            Math.max(0, finiteNumber(args.environmentXpBonusPct)),
          ),
          environmentByproductMultiplier: Math.max(
            1,
            finiteNumber(args.environmentByproductMultiplier, 1),
          ),
        }
      : {}),
  };
}

export function parseAutoGatheringState(raw: unknown): AutoGatheringState {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawRemainders =
    value.remainders && typeof value.remainders === "object"
      ? (value.remainders as Record<string, unknown>)
      : {};
  const remainders: AutoGatheringRemainders = {
    successes: remainderMap(rawRemainders.successes),
    materials: remainderMap(rawRemainders.materials),
    xp: unitRemainder(rawRemainders.xp),
    mastery: unitRemainder(rawRemainders.mastery),
  };
  if (!value.session || typeof value.session !== "object") {
    return { session: null, remainders };
  }
  const session = value.session as Record<string, unknown>;
  if (
    typeof session.sessionId !== "string" ||
    !session.sessionId ||
    typeof session.sourceId !== "string" ||
    !session.sourceId ||
    typeof session.sourceName !== "string" ||
    typeof session.materialId !== "string"
  ) {
    return { session: null, remainders };
  }
  const startedAt = finiteNumber(session.startedAt, Number.NaN);
  const readyAt = finiteNumber(session.readyAt, Number.NaN);
  const cycleDurationMs = finiteNumber(session.cycleDurationMs, Number.NaN);
  const attempts = finiteNumber(session.attempts, Number.NaN);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(readyAt) ||
    !Number.isFinite(cycleDurationMs) ||
    !Number.isFinite(attempts)
  ) {
    return { session: null, remainders };
  }
  return {
    session: {
      sessionId: session.sessionId,
      planId: autoGatheringPlan(session.planId).id,
      sourceId: session.sourceId,
      sourceName: session.sourceName,
      materialId: session.materialId,
      startedAt: Math.floor(startedAt),
      readyAt: Math.floor(readyAt),
      cycleDurationMs: Math.max(1_000, Math.floor(cycleDurationMs)),
      attempts: Math.max(1, Math.floor(attempts)),
      successRate: Math.min(1, Math.max(0, finiteNumber(session.successRate))),
      materialEfficiency: Math.min(
        1,
        Math.max(
          0,
          finiteNumber(
            session.materialEfficiency,
            autoGatheringPlan(session.planId).materialEfficiency,
          ),
        ),
      ),
      xpEfficiency: Math.min(
        1,
        Math.max(
          0,
          finiteNumber(
            session.xpEfficiency,
            autoGatheringPlan(session.planId).xpEfficiency,
          ),
        ),
      ),
      bonusMaterialRate: Math.min(
        1,
        Math.max(0, finiteNumber(session.bonusMaterialRate)),
      ),
      baseXp: Math.max(0, Math.floor(finiteNumber(session.baseXp))),
      aidItemId: typeof session.aidItemId === "string" ? session.aidItemId : undefined,
      aidBonusMaterialRate: Math.min(1, Math.max(0, finiteNumber(session.aidBonusMaterialRate))),
      aidByproductMultiplier: Math.max(1, finiteNumber(session.aidByproductMultiplier, 1)),
      spotId: typeof session.spotId === "string" ? session.spotId : undefined,
      lifeEnvironmentId:
        isLifeFieldEnvironmentId(session.lifeEnvironmentId)
          ? session.lifeEnvironmentId
          : undefined,
      lifeEnvironmentDayKey:
        typeof session.lifeEnvironmentDayKey === "string"
          ? session.lifeEnvironmentDayKey
          : undefined,
      environmentPrimaryBonusChance: Math.min(
        1,
        Math.max(0, finiteNumber(session.environmentPrimaryBonusChance)),
      ),
      environmentXpBonusPct: Math.min(
        100,
        Math.max(0, finiteNumber(session.environmentXpBonusPct)),
      ),
      environmentByproductMultiplier: Math.max(
        1,
        finiteNumber(session.environmentByproductMultiplier, 1),
      ),
    },
    remainders,
  };
}

export function beginAutoGathering(
  state: AutoGatheringState,
  session: AutoGatheringSession,
): AutoGatheringState {
  return { session, remainders: state.remainders };
}

export function cancelAutoGathering(
  state: AutoGatheringState,
): AutoGatheringState {
  return { session: null, remainders: state.remainders };
}

export function autoGatheringCompletedAttempts(
  session: AutoGatheringSession,
  now: number,
): number {
  const elapsedMs = Math.max(0, finiteNumber(now) - session.startedAt);
  return Math.min(
    session.attempts,
    Math.max(0, Math.floor(elapsedMs / session.cycleDurationMs)),
  );
}

export type AutoGatheringSettlement = {
  attempts: number;
  successes: number;
  materialsGained: number;
  xpGained: number;
  masteryGained: number;
  state: AutoGatheringState;
};

function splitWholeReward(value: number): { whole: number; remainder: number } {
  const whole = Math.floor(value + 1e-9);
  return { whole, remainder: Math.max(0, value - whole) };
}

export function settleAutoGathering(
  state: AutoGatheringState,
  attempts: number = state.session?.attempts ?? 0,
): AutoGatheringSettlement | null {
  const session = state.session;
  if (!session) return null;

  const settledAttempts = Math.min(
    session.attempts,
    Math.max(0, Math.floor(finiteNumber(attempts))),
  );

  const expectedSuccesses =
    (state.remainders.successes[session.sourceId] ?? 0) +
    settledAttempts * session.successRate;
  const successReward = splitWholeReward(expectedSuccesses);
  const successes = successReward.whole;
  const expectedMaterials =
    (state.remainders.materials[session.materialId] ?? 0) +
    successes *
      (1 + session.bonusMaterialRate + (session.environmentPrimaryBonusChance ?? 0)) *
      session.materialEfficiency;
  const materialReward = splitWholeReward(expectedMaterials);
  const materialsGained = materialReward.whole;
  const expectedXp =
    state.remainders.xp +
    successes *
      session.baseXp *
      session.xpEfficiency *
      (1 + (session.environmentXpBonusPct ?? 0) / 100);
  const xpReward = splitWholeReward(expectedXp);
  const xpGained = xpReward.whole;
  const expectedMastery =
    state.remainders.mastery + successes * session.xpEfficiency;
  const masteryReward = splitWholeReward(expectedMastery);
  const masteryGained = masteryReward.whole;

  return {
    attempts: settledAttempts,
    successes,
    materialsGained,
    xpGained,
    masteryGained,
    state: {
      session: null,
      remainders: {
        successes: {
          ...state.remainders.successes,
          [session.sourceId]: successReward.remainder,
        },
        materials: {
          ...state.remainders.materials,
          [session.materialId]: materialReward.remainder,
        },
        xp: xpReward.remainder,
        mastery: masteryReward.remainder,
      },
    },
  };
}

export function emptyAutoGatheringState(): AutoGatheringState {
  return {
    session: null,
    remainders: {
      ...EMPTY_REMAINDERS,
      successes: {},
      materials: {},
    },
  };
}
