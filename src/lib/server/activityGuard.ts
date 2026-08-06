import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

export const ACTIVITY_GUARD_KEY = "activity-guard.v1";
export const ACTIVITY_CHECKPOINT_COMPLETIONS = 500;
export const ACTIVITY_CHECKPOINT_CONTINUOUS_MS = 3 * 60 * 60_000;
export const ACTIVITY_SEQUENCE_RESET_MS = 10 * 60_000;
export const ACTIVITY_STRONG_SIGNAL_THRESHOLD = 3;
export const ACTIVITY_STRONG_SIGNAL_WINDOW_MS = 10 * 60_000;
export const ACTIVITY_EARLY_ATTEMPT_THRESHOLD = 3;
export const ACTIVITY_EARLY_ATTEMPT_WINDOW_MS = 10 * 60_000;
export const ACTIVITY_DAILY_ALERT_COMPLETIONS = 500;
export const ACTIVITY_RISK_DECAY_PER_HOUR = 2;
export const ACTIVITY_RISK_STRONG_SIGNAL = 18;
export const ACTIVITY_RISK_WATCH_THRESHOLD = 20;
export const ACTIVITY_RISK_HIGH_THRESHOLD = 50;
export const ACTIVITY_RISK_CRITICAL_THRESHOLD = 75;
export const ACTIVITY_RISK_HIGH_COOLDOWN_MS = 30_000;
export const ACTIVITY_RISK_CRITICAL_COOLDOWN_MS = 2 * 60_000;
export const ACTIVITY_BEHAVIOR_STAGE_COMPLETIONS = 30;
export const ACTIVITY_BEHAVIOR_SIGNAL_SCORE = 6;
export const ACTIVITY_REGULARITY_MIN_INTERVALS = 24;
export const ACTIVITY_REGULARITY_MAX_CV = 0.015;
export const ACTIVITY_REGULARITY_MIN_ACTIVE_MS = 2 * 60_000;

const ACTIVITY_GLOBAL_VOLUME_STAGES = [
  { completions: 500, score: 5 },
  { completions: 1_000, score: 10 },
  { completions: 1_500, score: 20 },
  { completions: 2_500, score: 30 },
  { completions: 4_000, score: 35 },
] as const;

export type GuardedActivity = "fishing" | "woodcutting" | "mining";
export type ActivityRiskLevel = "normal" | "watch" | "high" | "critical";

type ActivityGuardEntry = {
  sequenceStartedAt: number | null;
  lastCompletedAt: number | null;
  completedSinceVerification: number;
  verificationRequiredAt: number | null;
  strongSignalWindowStartedAt: number | null;
  strongSignals: number;
  earlyAttemptWindowStartedAt: number | null;
  earlyAttempts: number;
  dailyKey: string;
  dailyCompleted: number;
  dailyAlerted: boolean;
  checkpointTarget: number;
  intervalSamples: number;
  intervalMeanMs: number;
  intervalM2Ms: number;
  behaviorStage: number;
  behaviorSignals: number;
};

type ActivityRiskState = {
  score: number;
  updatedAt: number | null;
  cooldownUntil: number | null;
  dailyKey: string;
  dailyCompleted: number;
  dailyVolumeStage: number;
  dailyVerifications: number;
};

export type ActivityGuardState = {
  version: 5;
  activities: Record<GuardedActivity, ActivityGuardEntry>;
  risk: ActivityRiskState;
};

export type ActivityGuardUpdate = {
  state: ActivityGuardState;
  checkpointNewlyRequired: boolean;
  extremeVolumeAlert: boolean;
  behaviorSignal: string | null;
};

export type ActivityCompletionObservation = {
  patternSignals?: string[];
};

function emptyEntry(): ActivityGuardEntry {
  return {
    sequenceStartedAt: null,
    lastCompletedAt: null,
    completedSinceVerification: 0,
    verificationRequiredAt: null,
    strongSignalWindowStartedAt: null,
    strongSignals: 0,
    earlyAttemptWindowStartedAt: null,
    earlyAttempts: 0,
    dailyKey: "",
    dailyCompleted: 0,
    dailyAlerted: false,
    checkpointTarget: ACTIVITY_CHECKPOINT_COMPLETIONS,
    intervalSamples: 0,
    intervalMeanMs: 0,
    intervalM2Ms: 0,
    behaviorStage: 0,
    behaviorSignals: 0,
  };
}

function emptyRisk(): ActivityRiskState {
  return {
    score: 0,
    updatedAt: null,
    cooldownUntil: null,
    dailyKey: "",
    dailyCompleted: 0,
    dailyVolumeStage: 0,
    dailyVerifications: 0,
  };
}

export function emptyActivityGuardState(): ActivityGuardState {
  return {
    version: 5,
    activities: {
      fishing: emptyEntry(),
      woodcutting: emptyEntry(),
      mining: emptyEntry(),
    },
    risk: emptyRisk(),
  };
}

function nonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function nullableTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseEntry(raw: unknown): ActivityGuardEntry {
  if (!raw || typeof raw !== "object") return emptyEntry();
  const value = raw as Record<string, unknown>;
  return {
    sequenceStartedAt: nullableTimestamp(value.sequenceStartedAt),
    lastCompletedAt: nullableTimestamp(value.lastCompletedAt),
    completedSinceVerification: nonNegativeInt(value.completedSinceVerification),
    verificationRequiredAt: nullableTimestamp(value.verificationRequiredAt),
    strongSignalWindowStartedAt: nullableTimestamp(value.strongSignalWindowStartedAt),
    strongSignals: nonNegativeInt(value.strongSignals),
    earlyAttemptWindowStartedAt: nullableTimestamp(value.earlyAttemptWindowStartedAt),
    earlyAttempts: nonNegativeInt(value.earlyAttempts),
    dailyKey: typeof value.dailyKey === "string" ? value.dailyKey.slice(0, 16) : "",
    dailyCompleted: nonNegativeInt(value.dailyCompleted),
    dailyAlerted: value.dailyAlerted === true,
    checkpointTarget: Math.max(
      1,
      nonNegativeInt(value.checkpointTarget) || ACTIVITY_CHECKPOINT_COMPLETIONS,
    ),
    intervalSamples: nonNegativeInt(value.intervalSamples),
    intervalMeanMs: nonNegativeNumber(value.intervalMeanMs),
    intervalM2Ms: nonNegativeNumber(value.intervalM2Ms),
    behaviorStage: nonNegativeInt(value.behaviorStage),
    behaviorSignals: nonNegativeInt(value.behaviorSignals),
  };
}

function parseRisk(raw: unknown): ActivityRiskState {
  if (!raw || typeof raw !== "object") return emptyRisk();
  const value = raw as Record<string, unknown>;
  return {
    score: Math.min(100, nonNegativeInt(value.score)),
    updatedAt: nullableTimestamp(value.updatedAt),
    cooldownUntil: nullableTimestamp(value.cooldownUntil),
    dailyKey: typeof value.dailyKey === "string" ? value.dailyKey.slice(0, 16) : "",
    dailyCompleted: nonNegativeInt(value.dailyCompleted),
    dailyVolumeStage: Math.min(
      ACTIVITY_GLOBAL_VOLUME_STAGES.length,
      nonNegativeInt(value.dailyVolumeStage),
    ),
    dailyVerifications: nonNegativeInt(value.dailyVerifications),
  };
}

export function parseActivityGuardState(raw: unknown): ActivityGuardState {
  if (!raw || typeof raw !== "object") return emptyActivityGuardState();
  const storedVersion = nonNegativeInt((raw as { version?: unknown }).version);
  // v5에서 정상 이용자에게 지나치게 잦았던 확인 주기와 위험도 산정을 완화했다.
  // 이전 버전의 확인 대기·의심 점수·행동 신호는 이어받지 않고 한 번 초기화한다.
  if (storedVersion < 5) return emptyActivityGuardState();
  const activities = (raw as { activities?: unknown }).activities;
  const source =
    activities && typeof activities === "object"
      ? (activities as Record<string, unknown>)
      : {};
  return {
    version: 5,
    activities: {
      fishing: parseEntry(source.fishing),
      woodcutting: parseEntry(source.woodcutting),
      mining: parseEntry(source.mining),
    },
    risk: parseRisk((raw as { risk?: unknown }).risk),
  };
}

export function activityRiskLevel(score: number): ActivityRiskLevel {
  if (score >= ACTIVITY_RISK_CRITICAL_THRESHOLD) return "critical";
  if (score >= ACTIVITY_RISK_HIGH_THRESHOLD) return "high";
  if (score >= ACTIVITY_RISK_WATCH_THRESHOLD) return "watch";
  return "normal";
}

function decayedRisk(risk: ActivityRiskState, now: number): ActivityRiskState {
  const updatedAt = risk.updatedAt;
  if (!updatedAt || now <= updatedAt) return { ...risk, updatedAt: now };
  const elapsedHours = (now - updatedAt) / (60 * 60_000);
  return {
    ...risk,
    score: Math.max(0, risk.score - elapsedHours * ACTIVITY_RISK_DECAY_PER_HOUR),
    updatedAt: now,
    cooldownUntil:
      risk.cooldownUntil !== null && risk.cooldownUntil > now
        ? risk.cooldownUntil
        : null,
  };
}

export function activityCheckpointTarget(
  riskScore: number,
  rng: () => number = Math.random,
  context: {
    dailyCompleted?: number;
    // 운영 지표로는 유지하지만 확인 성공이 다음 확인을 앞당기지는 않는다.
    dailyVerifications?: number;
    behaviorSignals?: number;
  } = {},
): number {
  const [min, max] = activityCheckpointRange(riskScore, context);
  const roll = Math.min(0.999999, Math.max(0, Number(rng()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

function activityCheckpointRange(
  riskScore: number,
  context: {
    dailyCompleted?: number;
    dailyVerifications?: number;
    behaviorSignals?: number;
  } = {},
): [number, number] {
  const level = activityRiskLevel(riskScore);
  const riskRange: [number, number] = level === "critical"
    ? [40, 80]
    : level === "high"
      ? [100, 180]
      : level === "watch"
        ? [250, 400]
        : [400, 700];
  const dailyCompleted = nonNegativeInt(context.dailyCompleted);
  const behaviorSignals = nonNegativeInt(context.behaviorSignals);
  const pressure = Math.max(
    dailyCompleted >= 5_000
      ? 3
      : dailyCompleted >= 2_500
        ? 2
        : dailyCompleted >= 1_000
          ? 1
          : 0,
    behaviorSignals >= 4
      ? 4
      : behaviorSignals >= 3
        ? 3
        : behaviorSignals >= 2
          ? 2
          : behaviorSignals >= 1
            ? 1
            : 0,
  );
  const pressureRange: [number, number] =
    pressure >= 4
      ? [40, 80]
      : pressure === 3
        ? [100, 180]
        : pressure === 2
          ? [250, 400]
          : pressure === 1
            ? [300, 500]
            : [400, 700];
  return pressureRange[1] < riskRange[1] ? pressureRange : riskRange;
}

export function activityVerificationRequired(
  state: ActivityGuardState,
  activity: GuardedActivity,
  verificationConfigured: boolean,
): boolean {
  return (
    verificationConfigured &&
    (state.activities[activity].verificationRequiredAt !== null ||
      state.risk.score >= ACTIVITY_RISK_HIGH_THRESHOLD)
  );
}

function withEntry(
  state: ActivityGuardState,
  activity: GuardedActivity,
  entry: ActivityGuardEntry,
): ActivityGuardState {
  return {
    version: 5,
    activities: { ...state.activities, [activity]: entry },
    risk: state.risk,
  };
}

function withRisk(state: ActivityGuardState, risk: ActivityRiskState): ActivityGuardState {
  return { ...state, version: 5, risk };
}

function volumeRiskUpdate(
  risk: ActivityRiskState,
  now: number,
): ActivityRiskState {
  const dailyKey = kstDailyKey(new Date(now));
  const sameDay = risk.dailyKey === dailyKey;
  const dailyCompleted = (sameDay ? risk.dailyCompleted : 0) + 1;
  const previousStage = sameDay ? risk.dailyVolumeStage : 0;
  let nextStage = previousStage;
  let addedScore = 0;
  for (let index = previousStage; index < ACTIVITY_GLOBAL_VOLUME_STAGES.length; index += 1) {
    const stage = ACTIVITY_GLOBAL_VOLUME_STAGES[index];
    if (dailyCompleted < stage.completions) break;
    addedScore += stage.score;
    nextStage = index + 1;
  }
  const decayed = decayedRisk(risk, now);
  return {
    ...decayed,
    score: Math.min(100, decayed.score + addedScore),
    dailyKey,
    dailyCompleted,
    dailyVolumeStage: nextStage,
    dailyVerifications: sameDay ? risk.dailyVerifications : 0,
  };
}

function intervalStats(
  previous: ActivityGuardEntry,
  now: number,
  sequenceExpired: boolean,
) {
  if (sequenceExpired || previous.lastCompletedAt === null) {
    return { intervalSamples: 0, intervalMeanMs: 0, intervalM2Ms: 0 };
  }
  const intervalMs = now - previous.lastCompletedAt;
  if (intervalMs <= 0 || intervalMs > ACTIVITY_SEQUENCE_RESET_MS) {
    return { intervalSamples: 0, intervalMeanMs: 0, intervalM2Ms: 0 };
  }
  const intervalSamples = previous.intervalSamples + 1;
  const delta = intervalMs - previous.intervalMeanMs;
  const intervalMeanMs = previous.intervalMeanMs + delta / intervalSamples;
  const intervalM2Ms =
    previous.intervalM2Ms + delta * (intervalMs - intervalMeanMs);
  return { intervalSamples, intervalMeanMs, intervalM2Ms };
}

function observedBehaviorSignal(args: {
  previous: ActivityGuardEntry;
  completedSinceVerification: number;
  sequenceStartedAt: number;
  now: number;
  stats: ReturnType<typeof intervalStats>;
  observation: ActivityCompletionObservation;
}): { stage: number; signal: string | null } {
  const stage = Math.floor(
    args.completedSinceVerification / ACTIVITY_BEHAVIOR_STAGE_COMPLETIONS,
  );
  if (stage <= args.previous.behaviorStage) {
    return { stage: args.previous.behaviorStage, signal: null };
  }
  const patterns = new Set(
    (args.observation.patternSignals ?? []).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  const fishingPattern =
    patterns.has("near_perfect_success_rate") &&
    (patterns.has("uniform_client_reaction") ||
      patterns.has("uniform_server_reaction"));
  const variance =
    args.stats.intervalSamples > 1
      ? args.stats.intervalM2Ms / args.stats.intervalSamples
      : Number.POSITIVE_INFINITY;
  const coefficientOfVariation =
    args.stats.intervalMeanMs > 0
      ? Math.sqrt(Math.max(0, variance)) / args.stats.intervalMeanMs
      : Number.POSITIVE_INFINITY;
  const highlyRegular =
    args.stats.intervalSamples >= ACTIVITY_REGULARITY_MIN_INTERVALS &&
    args.now - args.sequenceStartedAt >= ACTIVITY_REGULARITY_MIN_ACTIVE_MS &&
    coefficientOfVariation <= ACTIVITY_REGULARITY_MAX_CV;
  // 높은 성공률과 균일한 반응은 숙련된 손플레이에서도 반복될 수 있다.
  // 완료 간격까지 기계적으로 일정할 때만 운영 위험도로 승격한다.
  if (!highlyRegular) {
    return { stage: args.previous.behaviorStage, signal: null };
  }
  return {
    stage,
    signal: fishingPattern
      ? "near_perfect_uniform_fishing"
      : "highly_regular_intervals",
  };
}

export function recordActivityCompletion(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
  observation: ActivityCompletionObservation = {},
): ActivityGuardUpdate {
  const previous = state.activities[activity];
  let risk = volumeRiskUpdate(state.risk, now);
  const sequenceExpired =
    previous.lastCompletedAt === null ||
    now < previous.lastCompletedAt ||
    now - previous.lastCompletedAt > ACTIVITY_SEQUENCE_RESET_MS;
  const sequenceStartedAt = sequenceExpired
    ? now
    : (previous.sequenceStartedAt ?? now);
  const completedSinceVerification = previous.completedSinceVerification + 1;
  const stats = intervalStats(previous, now, sequenceExpired);
  const behavior = observedBehaviorSignal({
    previous,
    completedSinceVerification,
    sequenceStartedAt,
    now,
    stats,
    observation,
  });
  if (behavior.signal) {
    risk = {
      ...risk,
      score: Math.min(100, risk.score + ACTIVITY_BEHAVIOR_SIGNAL_SCORE),
    };
  }
  const checkpointTarget = Math.min(
    previous.checkpointTarget,
    activityCheckpointRange(risk.score, {
      dailyCompleted: risk.dailyCompleted,
      behaviorSignals:
        previous.behaviorSignals + (behavior.signal ? 1 : 0),
    })[1],
  );
  const checkpointDue =
    completedSinceVerification >= checkpointTarget ||
    now - sequenceStartedAt >= ACTIVITY_CHECKPOINT_CONTINUOUS_MS ||
    risk.score >= ACTIVITY_RISK_HIGH_THRESHOLD;
  const checkpointNewlyRequired =
    checkpointDue && previous.verificationRequiredAt === null;

  const dailyKey = kstDailyKey(new Date(now));
  const sameDay = previous.dailyKey === dailyKey;
  const dailyCompleted = (sameDay ? previous.dailyCompleted : 0) + 1;
  const wasDailyAlerted = sameDay && previous.dailyAlerted;
  const extremeVolumeAlert =
    dailyCompleted >= ACTIVITY_DAILY_ALERT_COMPLETIONS && !wasDailyAlerted;

  const entry: ActivityGuardEntry = {
    ...previous,
    sequenceStartedAt,
    lastCompletedAt: now,
    completedSinceVerification,
    verificationRequiredAt: checkpointNewlyRequired
      ? now
      : previous.verificationRequiredAt,
    dailyKey,
    dailyCompleted,
    dailyAlerted: wasDailyAlerted || extremeVolumeAlert,
    checkpointTarget,
    ...stats,
    behaviorStage: behavior.stage,
    behaviorSignals:
      previous.behaviorSignals + (behavior.signal ? 1 : 0),
  };
  const nextState = withRisk(withEntry(state, activity, entry), risk);
  return {
    state: nextState,
    checkpointNewlyRequired,
    extremeVolumeAlert,
    behaviorSignal: behavior.signal,
  };
}

export function recordActivityStrongSignal(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
): ActivityGuardUpdate {
  const previous = state.activities[activity];
  const decayed = decayedRisk(state.risk, now);
  const riskScore = Math.min(100, decayed.score + ACTIVITY_RISK_STRONG_SIGNAL);
  const level = activityRiskLevel(riskScore);
  const cooldownMs =
    level === "critical"
      ? ACTIVITY_RISK_CRITICAL_COOLDOWN_MS
      : level === "high"
        ? ACTIVITY_RISK_HIGH_COOLDOWN_MS
        : 0;
  const risk: ActivityRiskState = {
    ...decayed,
    score: riskScore,
    cooldownUntil: cooldownMs > 0 ? now + cooldownMs : decayed.cooldownUntil,
  };
  const windowExpired =
    previous.strongSignalWindowStartedAt === null ||
    now < previous.strongSignalWindowStartedAt ||
    now - previous.strongSignalWindowStartedAt > ACTIVITY_STRONG_SIGNAL_WINDOW_MS;
  const strongSignalWindowStartedAt = windowExpired
    ? now
    : previous.strongSignalWindowStartedAt;
  const strongSignals = (windowExpired ? 0 : previous.strongSignals) + 1;
  const checkpointNewlyRequired =
    (strongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD ||
      riskScore >= ACTIVITY_RISK_HIGH_THRESHOLD) &&
    previous.verificationRequiredAt === null;
  const entry: ActivityGuardEntry = {
    ...previous,
    strongSignalWindowStartedAt,
    strongSignals,
    verificationRequiredAt: checkpointNewlyRequired
      ? now
      : previous.verificationRequiredAt,
    checkpointTarget: Math.min(
      previous.checkpointTarget,
      activityCheckpointRange(riskScore)[1],
    ),
  };
  return {
    state: withRisk(withEntry(state, activity, entry), risk),
    checkpointNewlyRequired,
    extremeVolumeAlert: false,
    behaviorSignal: null,
  };
}

export type ActivityEarlyAttemptUpdate = ActivityGuardUpdate & {
  earlyAttempts: number;
  strongSignalPromoted: boolean;
};

// 정상 이용자의 단발성 선입력은 점수에 반영하지 않는다. 같은 활동에서 짧은 시간
// 안에 반복될 때만 강한 신호 한 건으로 승격하고 카운터를 다시 시작한다.
export function recordActivityEarlyAttempt(
  state: ActivityGuardState,
  activity: Exclude<GuardedActivity, "fishing">,
  now: number,
): ActivityEarlyAttemptUpdate {
  const previous = state.activities[activity];
  const windowExpired =
    previous.earlyAttemptWindowStartedAt === null ||
    now < previous.earlyAttemptWindowStartedAt ||
    now - previous.earlyAttemptWindowStartedAt > ACTIVITY_EARLY_ATTEMPT_WINDOW_MS;
  const earlyAttemptWindowStartedAt = windowExpired
    ? now
    : previous.earlyAttemptWindowStartedAt;
  const earlyAttempts = (windowExpired ? 0 : previous.earlyAttempts) + 1;

  if (earlyAttempts < ACTIVITY_EARLY_ATTEMPT_THRESHOLD) {
    return {
      state: withEntry(state, activity, {
        ...previous,
        earlyAttemptWindowStartedAt,
        earlyAttempts,
      }),
      checkpointNewlyRequired: false,
      extremeVolumeAlert: false,
      behaviorSignal: null,
      earlyAttempts,
      strongSignalPromoted: false,
    };
  }

  const promoted = recordActivityStrongSignal(
    withEntry(state, activity, {
      ...previous,
      earlyAttemptWindowStartedAt: null,
      earlyAttempts: 0,
    }),
    activity,
    now,
  );
  return {
    ...promoted,
    earlyAttempts,
    strongSignalPromoted: true,
  };
}

export function clearActivityVerification(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
): ActivityGuardState {
  const previous = state.activities[activity];
  const decayed = decayedRisk(state.risk, now);
  const dailyKey = kstDailyKey(new Date(now));
  const sameDay = decayed.dailyKey === dailyKey;
  const risk = {
    ...decayed,
    score: Math.max(0, decayed.score - 30),
    cooldownUntil: null,
    dailyKey,
    dailyCompleted: sameDay ? decayed.dailyCompleted : 0,
    dailyVolumeStage: sameDay ? decayed.dailyVolumeStage : 0,
    dailyVerifications: (sameDay ? decayed.dailyVerifications : 0) + 1,
  };
  return withRisk(withEntry(state, activity, {
    ...previous,
    sequenceStartedAt: now,
    lastCompletedAt: null,
    completedSinceVerification: 0,
    verificationRequiredAt: null,
    strongSignalWindowStartedAt: null,
    strongSignals: 0,
    earlyAttemptWindowStartedAt: null,
    earlyAttempts: 0,
    checkpointTarget: activityCheckpointTarget(risk.score, Math.random, {
      dailyCompleted: risk.dailyCompleted,
    }),
    intervalSamples: 0,
    intervalMeanMs: 0,
    intervalM2Ms: 0,
    behaviorStage: 0,
    behaviorSignals: 0,
  }), risk);
}

export function activityGuardView(
  state: ActivityGuardState,
  activity: GuardedActivity,
) {
  const entry = state.activities[activity];
  return {
    completedSinceVerification: entry.completedSinceVerification,
    verificationRequiredAt: entry.verificationRequiredAt,
    strongSignals: entry.strongSignals,
    earlyAttempts: entry.earlyAttempts,
    dailyCompleted: entry.dailyCompleted,
    checkpointTarget: entry.checkpointTarget,
    riskScore: Math.round(state.risk.score * 100) / 100,
    riskLevel: activityRiskLevel(state.risk.score),
    cooldownUntil: state.risk.cooldownUntil,
    nextActionAt: state.risk.cooldownUntil,
    globalDailyCompleted: state.risk.dailyCompleted,
    dailyVerifications: state.risk.dailyVerifications,
    behaviorSignals: entry.behaviorSignals,
    intervalSamples: entry.intervalSamples,
    intervalMeanMs: Math.round(entry.intervalMeanMs),
    intervalStddevMs:
      entry.intervalSamples > 1
        ? Math.round(Math.sqrt(entry.intervalM2Ms / entry.intervalSamples))
        : 0,
  };
}

export function activityVerificationReason(
  state: ActivityGuardState,
  activity: GuardedActivity,
): "volume" | "strong_signal" {
  const totalStrongSignals = Object.values(state.activities).reduce(
    (sum, entry) => sum + entry.strongSignals,
    0,
  );
  const totalBehaviorSignals = Object.values(state.activities).reduce(
    (sum, entry) => sum + entry.behaviorSignals,
    0,
  );
  return state.activities[activity].strongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD ||
    totalStrongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD ||
    state.activities[activity].behaviorSignals >= 3 ||
    totalBehaviorSignals >= 3
    ? "strong_signal"
    : "volume";
}
