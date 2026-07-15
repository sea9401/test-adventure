import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { clientIpFromRequest, recordAbuseEventSoon } from "@/lib/server/abuseLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  activityVerificationRequired,
  clearActivityVerification,
  parseActivityGuardState,
  type GuardedActivity,
} from "@/lib/server/activityGuard";
import { turnstileConfig, verifyTurnstileToken } from "@/lib/server/turnstile";

function isGuardedActivity(value: unknown): value is GuardedActivity {
  return (
    value === "fishing" ||
    value === "woodcutting" ||
    value === "mining" ||
    value === "farming"
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
      detail: { error: verification.error, codes: verification.codes ?? [] },
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
    },
  });
  return Response.json({ ok: true, activity });
}
