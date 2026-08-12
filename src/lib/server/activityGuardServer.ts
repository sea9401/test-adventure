import type { ActivityGuardState, GuardedActivity } from "./activityGuard";
import {
  activityGuardView,
  activityVerificationContext,
} from "./activityGuard";
import { turnstileConfig } from "./turnstile";
import { hcaptchaConfig } from "./hcaptcha";
import { clientIpFromRequest, recordAbuseEventSoon } from "./abuseLog";
import { recordOpsSignal } from "./opsAlert";

export function activityVerificationGateResponse(
  state: ActivityGuardState,
  activity: GuardedActivity,
): Response | null {
  const config = turnstileConfig();
  const view = activityGuardView(state, activity);
  const now = Date.now();
  if (view.cooldownUntil !== null && view.cooldownUntil > now) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((view.cooldownUntil - now) / 1000),
    );
    return Response.json(
      {
        ok: false,
        error: "activity_cooldown",
        activity,
        riskLevel: view.riskLevel,
        retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }
  const context = activityVerificationContext(
    state,
    activity,
    config.configured,
    now,
  );
  if (!config.siteKey || !context.required) {
    return null;
  }
  const reason = context.reason;
  const captcha = hcaptchaConfig();
  return Response.json(
    {
      ok: false,
      error: "human_verification_required",
      activity,
      siteKey: config.siteKey,
      reason,
      manualTest: context.manualTest,
      riskLevel: view.riskLevel,
      captchaSiteKey:
        reason === "strong_signal" && captcha.configured
          ? captcha.siteKey
          : null,
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
      globalDailyCompleted: view.globalDailyCompleted,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
  recordOpsSignal({
    key: `abuse:extreme-activity:${args.activity}:${args.userId}`,
    alertType: "abuse.extreme_daily_activity",
    label: `extreme daily ${args.activity} activity`,
    threshold: 1,
    windowMs: 24 * 60 * 60_000,
    detail: {
      channel: "abuse",
      userId: args.userId,
      activity: args.activity,
      dailyCompleted: view.dailyCompleted,
      globalDailyCompleted: view.globalDailyCompleted,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
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
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
  recordOpsSignal({
    key: `abuse:strong-activity:${args.activity}:${args.userId}`,
    alertType: "abuse.strong_automation_signal",
    label: `repeated strong ${args.activity} automation signals`,
    threshold: 1,
    windowMs: 60 * 60_000,
    detail: {
      channel: "abuse",
      userId: args.userId,
      activity: args.activity,
      signal: args.signal,
      strongSignals: view.strongSignals,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
}

export function recordActivityVerificationRequiredSoon(args: {
  req: Request;
  userId: string;
  activity: GuardedActivity;
  state: ActivityGuardState;
}) {
  const view = activityGuardView(args.state, args.activity);
  recordAbuseEventSoon({
    userId: args.userId,
    ip: clientIpFromRequest(args.req),
    action: `v2:${args.activity}:human-check`,
    reason: "human_verification_required",
    detail: {
      completedSinceVerification: view.completedSinceVerification,
      checkpointTarget: view.checkpointTarget,
      dailyCompleted: view.dailyCompleted,
      globalDailyCompleted: view.globalDailyCompleted,
      dailyVerifications: view.dailyVerifications,
      behaviorSignals: view.behaviorSignals,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
}

export function recordBehaviorActivitySignalSoon(args: {
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
    reason: "activity_behavior_pattern",
    detail: {
      signal: args.signal,
      intervalSamples: view.intervalSamples,
      intervalMeanMs: view.intervalMeanMs,
      intervalStddevMs: view.intervalStddevMs,
      behaviorSignals: view.behaviorSignals,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
  recordOpsSignal({
    key: `abuse:behavior-pattern:${args.activity}:${args.userId}`,
    alertType: "abuse.behavior_pattern",
    label: `repeated ${args.activity} behavior pattern`,
    threshold: 3,
    windowMs: 60 * 60_000,
    detail: {
      channel: "abuse",
      userId: args.userId,
      activity: args.activity,
      signal: args.signal,
      behaviorSignals: view.behaviorSignals,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
    },
  });
}
