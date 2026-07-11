import type { ActivityGuardState, GuardedActivity } from "./activityGuard";
import {
  activityGuardView,
  activityVerificationReason,
  activityVerificationRequired,
} from "./activityGuard";
import { turnstileConfig } from "./turnstile";
import { clientIpFromRequest, recordAbuseEventSoon } from "./abuseLog";
import { recordOpsSignal } from "./opsAlert";

export function activityVerificationGateResponse(
  state: ActivityGuardState,
  activity: GuardedActivity,
): Response | null {
  const config = turnstileConfig();
  if (
    !config.siteKey ||
    !activityVerificationRequired(state, activity, config.configured)
  ) {
    return null;
  }
  return Response.json(
    {
      ok: false,
      error: "human_verification_required",
      activity,
      siteKey: config.siteKey,
      reason: activityVerificationReason(state, activity),
    },
    { status: 403 },
  );
}

export function recordExtremeActivityAlertSoon(args: {
  req: Request;
  userId: string;
  activity: GuardedActivity;
  state: ActivityGuardState;
}) {
  const view = activityGuardView(args.state, args.activity);
  recordAbuseEventSoon({
    userId: args.userId,
    ip: clientIpFromRequest(args.req),
    action: `v2:${args.activity}:activity-guard`,
    reason: "extreme_daily_activity",
    detail: {
      dailyCompleted: view.dailyCompleted,
      completedSinceVerification: view.completedSinceVerification,
    },
  });
  recordOpsSignal({
    key: `abuse:extreme-activity:${args.activity}:${args.userId}`,
    label: `extreme daily ${args.activity} activity`,
    threshold: 1,
    windowMs: 24 * 60 * 60_000,
    detail: {
      channel: "abuse",
      userId: args.userId,
      activity: args.activity,
      dailyCompleted: view.dailyCompleted,
    },
  });
}

export function recordStrongActivitySignalSoon(args: {
  req: Request;
  userId: string;
  activity: GuardedActivity;
  signal: string;
  state: ActivityGuardState;
}) {
  const view = activityGuardView(args.state, args.activity);
  recordAbuseEventSoon({
    userId: args.userId,
    ip: clientIpFromRequest(args.req),
    action: `v2:${args.activity}:activity-guard`,
    reason: "strong_activity_signal",
    detail: {
      signal: args.signal,
      strongSignals: view.strongSignals,
      verificationRequired: view.verificationRequiredAt !== null,
    },
  });
  recordOpsSignal({
    key: `abuse:strong-activity:${args.activity}:${args.userId}`,
    label: `repeated strong ${args.activity} automation signals`,
    threshold: 1,
    windowMs: 60 * 60_000,
    detail: {
      channel: "abuse",
      userId: args.userId,
      activity: args.activity,
      signal: args.signal,
      strongSignals: view.strongSignals,
    },
  });
}
