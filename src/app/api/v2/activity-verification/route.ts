import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { clientIpFromRequest, recordAbuseEventSoon } from "@/lib/server/abuseLog";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  activeManualActivityVerification,
  activityGuardView,
  activityVerificationContext,
  activityVerificationRequired,
  clearActivityVerification,
  parseActivityGuardState,
  type GuardedActivity,
} from "@/lib/server/activityGuard";
import { turnstileConfig, verifyTurnstileToken } from "@/lib/server/turnstile";
import { hcaptchaConfig, verifyHcaptchaToken } from "@/lib/server/hcaptcha";

function isGuardedActivity(value: unknown): value is GuardedActivity {
  return (
    value === "fishing" ||
    value === "woodcutting" ||
    value === "mining"
  );
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:activity-verification",
    userLimit: 10,
    ipLimit: 60,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    activity?: unknown;
    token?: unknown;
    captchaToken?: unknown;
  } | null;
  if (!isGuardedActivity(body?.activity) || typeof body?.token !== "string") {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const activity = body.activity;
  const token = body.token;
  if (!turnstileConfig().configured) {
    return Response.json(
      { ok: false, error: "verification_unconfigured" },
      { status: 503 },
    );
  }

  const currentState = parseActivityGuardState(
    await readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
  );
  const verificationContext = activityVerificationContext(
    currentState,
    activity,
    true,
  );
  if (!verificationContext.required) {
    return Response.json(
      { ok: false, error: "verification_not_required" },
      { status: 409 },
    );
  }
  const captcha = hcaptchaConfig();
  const captchaRequired =
    verificationContext.reason === "strong_signal" &&
    captcha.configured;
  const manualTest = verificationContext.manualTest;
  const manualMode = manualTest
    ? activeManualActivityVerification(currentState, activity)?.mode ?? null
    : null;
  const captchaToken =
    typeof body.captchaToken === "string" ? body.captchaToken : "";
  if (captchaRequired && !captchaToken) {
    return Response.json(
      { ok: false, error: "captcha_verification_required" },
      { status: 400 },
    );
  }

  const verification = await verifyTurnstileToken({
    token,
    activity,
    remoteIp: clientIpFromRequest(req),
  });
  if (!verification.ok) {
    recordAbuseEventSoon({
      userId,
      ip: clientIpFromRequest(req),
      action: `v2:${activity}:human-check`,
      reason: "human_verification_failed",
      detail: {
        error: verification.error,
        codes: verification.codes ?? [],
        manualTest,
        ...(manualMode ? { mode: manualMode } : {}),
      },
    });
    return Response.json(
      {
        ok: false,
        error:
          verification.error === "unavailable"
            ? "verification_unavailable"
            : "verification_failed",
      },
      { status: verification.error === "unavailable" ? 503 : 400 },
    );
  }

  if (captchaRequired) {
    const captchaVerification = await verifyHcaptchaToken({
      token: captchaToken,
      remoteIp: clientIpFromRequest(req),
    });
    if (!captchaVerification.ok) {
      recordAbuseEventSoon({
        userId,
        ip: clientIpFromRequest(req),
        action: `v2:${activity}:human-check`,
        reason: "human_verification_failed",
        detail: {
          provider: "hcaptcha",
          error: captchaVerification.error,
          codes: captchaVerification.codes ?? [],
          manualTest,
          ...(manualMode ? { mode: manualMode } : {}),
        },
      });
      return Response.json(
        {
          ok: false,
          error:
            captchaVerification.error === "unavailable"
              ? "captcha_verification_unavailable"
              : "captcha_verification_failed",
        },
        { status: captchaVerification.error === "unavailable" ? 503 : 400 },
      );
    }
  }

  const now = Date.now();
  const clearedState = await db.transaction(async (tx) => {
    const state = parseActivityGuardState(
      await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
    );
    if (!activityVerificationRequired(state, activity, true)) {
      return null;
    }
    const nextState = clearActivityVerification(state, activity, now);
    await upsertSave(
      tx,
      userId,
      ACTIVITY_GUARD_KEY,
      nextState,
    );
    return nextState;
  });
  if (!clearedState) {
    return Response.json(
      { ok: false, error: "verification_not_required" },
      { status: 409 },
    );
  }
  const view = activityGuardView(clearedState, activity);
  recordAbuseEventSoon({
    userId,
    ip: clientIpFromRequest(req),
    action: `v2:${activity}:human-check`,
    reason: "human_verification_succeeded",
    detail: {
      nextCheckpointTarget: view.checkpointTarget,
      dailyCompleted: view.dailyCompleted,
      globalDailyCompleted: view.globalDailyCompleted,
      dailyVerifications: view.dailyVerifications,
      riskScore: view.riskScore,
      riskLevel: view.riskLevel,
      manualTest,
      ...(manualMode ? { mode: manualMode } : {}),
    },
  });
  return Response.json({ ok: true, activity });
}
