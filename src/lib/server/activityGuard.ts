import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

export const ACTIVITY_GUARD_KEY = "activity-guard.v1";
export const ACTIVITY_CHECKPOINT_COMPLETIONS = 100;
export const ACTIVITY_CHECKPOINT_CONTINUOUS_MS = 60 * 60_000;
export const ACTIVITY_SEQUENCE_RESET_MS = 10 * 60_000;
export const ACTIVITY_STRONG_SIGNAL_THRESHOLD = 3;
export const ACTIVITY_STRONG_SIGNAL_WINDOW_MS = 10 * 60_000;
export const ACTIVITY_DAILY_ALERT_COMPLETIONS = 500;

export type GuardedActivity = "fishing" | "woodcutting";

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
};

export type ActivityGuardState = {
  version: 1;
  activities: Record<GuardedActivity, ActivityGuardEntry>;
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
  };
}

export function emptyActivityGuardState(): ActivityGuardState {
  return {
    version: 1,
    activities: {
      fishing: emptyEntry(),
      woodcutting: emptyEntry(),
    },
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
    version: 1,
    activities: {
      fishing: parseEntry(source.fishing),
      woodcutting: parseEntry(source.woodcutting),
    },
  };
}

export function activityVerificationRequired(
  state: ActivityGuardState,
  activity: GuardedActivity,
  verificationConfigured: boolean,
): boolean {
  return verificationConfigured && state.activities[activity].verificationRequiredAt !== null;
}

function withEntry(
  state: ActivityGuardState,
  activity: GuardedActivity,
  entry: ActivityGuardEntry,
): ActivityGuardState {
  return {
    version: 1,
    activities: { ...state.activities, [activity]: entry },
  };
}

export function recordActivityCompletion(
  state: ActivityGuardState,
  activity: GuardedActivity,
  now: number,
): ActivityGuardUpdate {
  const previous = state.activities[activity];
  const sequenceExpired =
    previous.lastCompletedAt === null ||
    now < previous.lastCompletedAt ||
    now - previous.lastCompletedAt > ACTIVITY_SEQUENCE_RESET_MS;
  const sequenceStartedAt = sequenceExpired
    ? now
    : (previous.sequenceStartedAt ?? now);
  const completedSinceVerification = previous.completedSinceVerification + 1;
  const checkpointDue =
    completedSinceVerification >= ACTIVITY_CHECKPOINT_COMPLETIONS ||
    now - sequenceStartedAt >= ACTIVITY_CHECKPOINT_CONTINUOUS_MS;
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
  };
  return {
    state: withEntry(state, activity, entry),
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
  const windowExpired =
    previous.strongSignalWindowStartedAt === null ||
    now < previous.strongSignalWindowStartedAt ||
    now - previous.strongSignalWindowStartedAt > ACTIVITY_STRONG_SIGNAL_WINDOW_MS;
  const strongSignalWindowStartedAt = windowExpired
    ? now
    : previous.strongSignalWindowStartedAt;
  const strongSignals = (windowExpired ? 0 : previous.strongSignals) + 1;
  const checkpointNewlyRequired =
    strongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD &&
    previous.verificationRequiredAt === null;
  const entry: ActivityGuardEntry = {
    ...previous,
    strongSignalWindowStartedAt,
    strongSignals,
    verificationRequiredAt: checkpointNewlyRequired
      ? now
      : previous.verificationRequiredAt,
  };
  return {
    state: withEntry(state, activity, entry),
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
  return withEntry(state, activity, {
    ...previous,
    sequenceStartedAt: now,
    lastCompletedAt: null,
    completedSinceVerification: 0,
    verificationRequiredAt: null,
    strongSignalWindowStartedAt: null,
    strongSignals: 0,
  });
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
  };
}

export function activityVerificationReason(
  state: ActivityGuardState,
  activity: GuardedActivity,
): "volume" | "strong_signal" {
  return state.activities[activity].strongSignals >= ACTIVITY_STRONG_SIGNAL_THRESHOLD
    ? "strong_signal"
    : "volume";
}
