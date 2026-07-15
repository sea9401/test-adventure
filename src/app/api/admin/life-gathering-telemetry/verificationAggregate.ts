import type { LifeGatheringActivity } from "@/lib/server/lifeGatheringTelemetry";

export const ACTIVITY_GUARD_EVENT_REASONS = [
  "human_verification_required",
  "human_verification_succeeded",
  "human_verification_failed",
  "activity_behavior_pattern",
] as const;

export type ActivityGuardEventReason =
  (typeof ACTIVITY_GUARD_EVENT_REASONS)[number];

export type ActivityGuardTelemetryRow = {
  userId: string | null;
  gameName: string | null;
  action: string;
  reason: string;
  detail: unknown;
  createdAt: Date;
};

function activityOf(action: string): LifeGatheringActivity | null {
  if (action.startsWith("v2:fishing:")) return "fishing";
  if (action.startsWith("v2:woodcutting:")) return "woodcutting";
  if (action.startsWith("v2:mining:")) return "mining";
  if (action.startsWith("v2:farming:")) return "farming";
  return null;
}

function detailOf(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function aggregateActivityGuardTelemetry(
  rows: ActivityGuardTelemetryRow[],
) {
  const counts: Record<ActivityGuardEventReason, number> = {
    human_verification_required: 0,
    human_verification_succeeded: 0,
    human_verification_failed: 0,
    activity_behavior_pattern: 0,
  };
  const users = new Map<
    string,
    {
      userId: string;
      gameName: string | null;
      required: number;
      succeeded: number;
      failed: number;
      behaviorPatterns: number;
      lastAt: number;
    }
  >();

  const events = rows.flatMap((row) => {
    const reason = ACTIVITY_GUARD_EVENT_REASONS.find(
      (candidate) => candidate === row.reason,
    );
    const activity = activityOf(row.action);
    if (!reason || !activity) return [];
    counts[reason] += 1;
    if (row.userId) {
      const current = users.get(row.userId) ?? {
        userId: row.userId,
        gameName: row.gameName,
        required: 0,
        succeeded: 0,
        failed: 0,
        behaviorPatterns: 0,
        lastAt: 0,
      };
      current.gameName = row.gameName ?? current.gameName;
      current.lastAt = Math.max(current.lastAt, row.createdAt.getTime());
      if (reason === "human_verification_required") current.required += 1;
      if (reason === "human_verification_succeeded") current.succeeded += 1;
      if (reason === "human_verification_failed") current.failed += 1;
      if (reason === "activity_behavior_pattern") current.behaviorPatterns += 1;
      users.set(row.userId, current);
    }
    return [{
      userId: row.userId,
      gameName: row.gameName,
      activity,
      reason,
      detail: detailOf(row.detail),
      createdAt: row.createdAt.toISOString(),
    }];
  });

  return {
    totals: {
      required: counts.human_verification_required,
      succeeded: counts.human_verification_succeeded,
      failed: counts.human_verification_failed,
      behaviorPatterns: counts.activity_behavior_pattern,
    },
    topUsers: [...users.values()]
      .sort(
        (a, b) =>
          b.behaviorPatterns - a.behaviorPatterns ||
          b.failed - a.failed ||
          b.required - a.required ||
          b.lastAt - a.lastAt,
      )
      .slice(0, 10)
      .map((row) => ({ ...row, lastAt: new Date(row.lastAt).toISOString() })),
    recent: events.slice(0, 50),
  };
}
