export const AUTO_GATHERING_DURATION_MS = 30 * 60 * 1_000;
export const AUTO_GATHERING_MATERIAL_EFFICIENCY = 0.8;
export const AUTO_GATHERING_XP_EFFICIENCY = 0.7;
export const WOODCUTTING_AUTO_KEY = "woodcutting-auto.v1";
export const MINING_AUTO_KEY = "mining-auto.v1";

export type AutoGatheringSession = {
  sessionId: string;
  sourceId: string;
  sourceName: string;
  materialId: string;
  startedAt: number;
  readyAt: number;
  cycleDurationMs: number;
  attempts: number;
  successRate: number;
  bonusMaterialRate: number;
  baseXp: number;
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

export function autoGatheringAttempts(cycleDurationMs: number): number {
  const safeCycleDurationMs = Math.max(
    1_000,
    Math.floor(finiteNumber(cycleDurationMs, 1_000)),
  );
  return Math.max(1, Math.floor(AUTO_GATHERING_DURATION_MS / safeCycleDurationMs));
}

export function createAutoGatheringSession(args: {
  sessionId: string;
  sourceId: string;
  sourceName: string;
  materialId: string;
  now: number;
  cycleDurationMs: number;
  successRate: number;
  bonusMaterialRate?: number;
  baseXp: number;
}): AutoGatheringSession {
  const cycleDurationMs = Math.max(
    1_000,
    Math.floor(finiteNumber(args.cycleDurationMs, 1_000)),
  );
  return {
    sessionId: args.sessionId,
    sourceId: args.sourceId,
    sourceName: args.sourceName,
    materialId: args.materialId,
    startedAt: args.now,
    readyAt: args.now + AUTO_GATHERING_DURATION_MS,
    cycleDurationMs,
    attempts: autoGatheringAttempts(cycleDurationMs),
    successRate: Math.min(1, Math.max(0, finiteNumber(args.successRate))),
    bonusMaterialRate: Math.min(
      1,
      Math.max(0, finiteNumber(args.bonusMaterialRate)),
    ),
    baseXp: Math.max(0, Math.floor(finiteNumber(args.baseXp))),
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
      sourceId: session.sourceId,
      sourceName: session.sourceName,
      materialId: session.materialId,
      startedAt: Math.floor(startedAt),
      readyAt: Math.floor(readyAt),
      cycleDurationMs: Math.max(1_000, Math.floor(cycleDurationMs)),
      attempts: Math.max(1, Math.floor(attempts)),
      successRate: Math.min(1, Math.max(0, finiteNumber(session.successRate))),
      bonusMaterialRate: Math.min(
        1,
        Math.max(0, finiteNumber(session.bonusMaterialRate)),
      ),
      baseXp: Math.max(0, Math.floor(finiteNumber(session.baseXp))),
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
): AutoGatheringSettlement | null {
  const session = state.session;
  if (!session) return null;

  const expectedSuccesses =
    (state.remainders.successes[session.sourceId] ?? 0) +
    session.attempts * session.successRate;
  const successReward = splitWholeReward(expectedSuccesses);
  const successes = successReward.whole;
  const expectedMaterials =
    (state.remainders.materials[session.materialId] ?? 0) +
    successes *
      (1 + session.bonusMaterialRate) *
      AUTO_GATHERING_MATERIAL_EFFICIENCY;
  const materialReward = splitWholeReward(expectedMaterials);
  const materialsGained = materialReward.whole;
  const expectedXp =
    state.remainders.xp +
    successes * session.baseXp * AUTO_GATHERING_XP_EFFICIENCY;
  const xpReward = splitWholeReward(expectedXp);
  const xpGained = xpReward.whole;
  const expectedMastery =
    state.remainders.mastery + successes * AUTO_GATHERING_XP_EFFICIENCY;
  const masteryReward = splitWholeReward(expectedMastery);
  const masteryGained = masteryReward.whole;

  return {
    attempts: session.attempts,
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
