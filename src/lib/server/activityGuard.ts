import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

export const ACTIVITY_GUARD_KEY = "activity-guard.v1";
export const ACTIVITY_CHECKPOINT_COMPLETIONS = 100;
export const ACTIVITY_CHECKPOINT_CONTINUOUS_MS = 60 * 60_000;
export const ACTIVITY_SEQUENCE_RESET_MS = 10 * 60_000;
export const ACTIVITY_STRONG_SIGNAL_THRESHOLD = 3;
export const ACTIVITY_STRONG_SIGNAL_WINDOW_MS = 10 * 60_000;
export const ACTIVITY_DAILY_ALERT_COMPLETIONS = 500;
export const ACTIVITY_RISK_DECAY_PER_HOUR = 2;
export const ACTIVITY_RISK_STRONG_SIGNAL = 18;
export const ACTIVITY_RISK_WATCH_THRESHOLD = 20;
export const ACTIVITY_RISK_HIGH_THRESHOLD = 50;
export const ACTIVITY_RISK_CRITICAL_THRESHOLD = 75;
export const ACTIVITY_RISK_HIGH_COOLDOWN_MS = 30_000;
export const ACTIVITY_RISK_CRITICAL_COOLDOWN_MS = 2 * 60_000;

const ACTIVITY_GLOBAL_VOLUME_STAGES = [
  { completions: 500, score: 5 },
  { completions: 1_000, score: 10 },
  { completions: 1_500, score: 20 },
  { completions: 2_500, score: 30 },
  { completions: 4_000, score: 35 },
] as const;

export type GuardedActivity = "fishing" | "woodcutting" | "mining" | "farming";
export type ActivityRiskLevel = "normal" | "watch" | "high" | "critical";

type ActivityGuardEntry = {
  sequenceStartedAt: number | null;
  lastCompletedAt: number | null;
  completedSinceVerification: number;
  verificationRequiredAt: number | null;
  strongSignalWindowStartedAt: number | null;
  strongSignals: number;
  dailyKey: string;
  dailyCompleted: number;
  dailyAlerted: boolean;
  checkpointTarget: number;
};

type ActivityRiskState = {
  score: number;
  updatedAt: number | null;
  cooldownUntil: number | null;
  dailyKey: string;
  dailyCompleted: number;
  dailyVolumeStage: number;
};

export type ActivityGuardState = {
  version: 2;
  activities: Record<GuardedActivity, ActivityGuardEntry>;
  risk: ActivityRiskState;
};

export type ActivityGuardUpdate = {
  state: ActivityGuardState;
  checkpointNewlyRequired: boolean;
  extremeVolumeAlert: boolean;
};

function emptyEntry(): ActivityGuardEntry {
  return {
    sequenceStartedAt: null,
    lastCompletedAt: null,
    completedSinceVerification: 0,
    verificationRequiredAt: null,
    strongSignalWindowStartedAt: null,
    strongSignals: 0,
    dailyKey: "",
    dailyCompleted: 0,
    dailyAlerted: false,
    checkpointTarget: ACTIVITY_CHECKPOINT_COMPLETIONS,
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
  };
}

export function emptyActivityGuardState(): ActivityGuardState {
  return {
    version: 2,
    activities: {
      fishing: emptyEntry(),
      woodcutting: emptyEntry(),
      mining: emptyEntry(),
      farming: emptyEntry(),
    },
    risk: emptyRisk(),
  };
}

function nonNegativeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
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
    dailyKey: typeof value.dailyKey === "string" ? value.dailyKey.slice(0, 16) : "",
    dailyCompleted: nonNegativeInt(value.dailyCompleted),
    dailyAlerted: value.dailyAlerted === true,
    checkpointTarget: Math.max(
      1,
      nonNegativeInt(value.checkpointTarget) || ACTIVITY_CHECKPOINT_COMPLETIONS,
    ),
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
  };
}

export function parseActivityGuardState(raw: unknown): ActivityGuardState {
  if (!raw || typeof raw !== "object") return emptyActivityGuardState();
  const activities = (raw as { activities?: unknown }).activities;
  const source =
    activities && typeof activities === "object"
      ? (activities as Record<string, unknown>)
      : {};
  return {
    version: 2,
    activities: {
      fishing: parseEntry(source.fishing),
      woodcutting: parseEntry(source.woodcutting),
      mining: parseEntry(source.mining),
      farming: parseEntry(source.farming),
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
): number {
  const [min, max] = activityCheckpointRange(riskScore);
  const roll = Math.min(0.999999, Math.max(0, Number(rng()) || 0));
  return min + Math.floor(roll * (max - min + 1));
}

function activityCheckpointRange(riskScore: number): [number, number] {
  const level = activityRiskLevel(riskScore);
  return level === "critical"
    ? [10, 25]
    : level === "high"
      ? [25, 50]
      : level === "watch"
        ? [50, 80]
        : [80, 140];
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
    version: 2,
    activities: { ...state.activities, [activity]: entry },
    risk: state.risk,
  };
}

function withRisk(state: ActivityGuardState, risk: ActivityRiskState): ActivityGuardState {
  return { ...state, version: 2, risk };
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
  };
}

export function recordActivityCompletion(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
): ActivityGuardUpdate {
  const previous = state.activities[activity];
  const risk = volumeRiskUpdate(state.risk, now);
  const sequenceExpired =
    previous.lastCompletedAt === null ||
    now < previous.lastCompletedAt ||
    now - previous.lastCompletedAt > ACTIVITY_SEQUENCE_RESET_MS;
  const sequenceStartedAt = sequenceExpired
    ? now
    : (previous.sequenceStartedAt ?? now);
  const completedSinceVerification = previous.completedSinceVerification + 1;
  const checkpointTarget = Math.min(
    previous.checkpointTarget,
    activityCheckpointRange(risk.score)[1],
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
  };
  const nextState = withRisk(withEntry(state, activity, entry), risk);
  return {
    state: nextState,
    checkpointNewlyRequired,
    extremeVolumeAlert,
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
  };
}

export function clearActivityVerification(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
): ActivityGuardState {
  const previous = state.activities[activity];
  const decayed = decayedRisk(state.risk, now);
  const risk = {
    ...decayed,
    score: Math.max(0, decayed.score - 30),
    cooldownUntil: null,
  };
  return withRisk(withEntry(state, activity, {
    ...previous,
    sequenceStartedAt: now,
    lastCompletedAt: null,
    completedSinceVerification: 0,
    verificationRequiredAt: null,
    strongSignalWindowStartedAt: null,
    strongSignals: 0,
    checkpointTarget: activityCheckpointTarget(risk.score),
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
    dailyCompleted: entry.dailyCompleted,
    checkpointTarget: entry.checkpointTarget,
    riskScore: Math.round(state.risk.score * 100) / 100,
    riskLevel: activityRiskLevel(state.risk.score),
    cooldownUntil: state.risk.cooldownUntil,
    globalDailyCompleted: state.risk.dailyCompleted,
  };
}

export function activityRewardMultiplier(state: ActivityGuardState): number {
  const completed = state.risk.dailyCompleted;
  if (completed >= 4_000) return 0.25;
  if (completed >= 2_500) return 0.5;
  if (completed >= 1_500) return 0.75;
  return 1;
}

export function activityVerificationReason(
  state: ActivityGuardState,
  activity: GuardedActivity,
): "volume" | "strong_signal" {
  return state.activities[activity].strongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD ||
    state.risk.score >= ACTIVITY_RISK_HIGH_THRESHOLD
    ? "strong_signal"
    : "volume";
}
