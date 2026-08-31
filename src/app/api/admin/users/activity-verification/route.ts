import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ACTIVITY_GUARD_KEY,
  activeManualActivityVerification,
  clearManualActivityVerification,
  organicActivityVerificationRequired,
  parseActivityGuardState,
  setManualActivityVerification,
  type GuardedActivity,
  type ManualActivityVerificationMode,
} from "@/lib/server/activityGuard";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordAbuseEventSoon } from "@/lib/server/abuseLog";
import { hcaptchaConfig } from "@/lib/server/hcaptcha";
import { currentAdminEmail, requireAdminRole } from "@/lib/server/isAdmin";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";
import { turnstileConfig } from "@/lib/server/turnstile";

const ACTIVITIES: GuardedActivity[] = ["fishing", "woodcutting", "mining"];

function guardedActivity(value: unknown): GuardedActivity | null {
  return typeof value === "string" &&
    ACTIVITIES.includes(value as GuardedActivity)
    ? (value as GuardedActivity)
    : null;
}

function verificationMode(value: unknown): ManualActivityVerificationMode | null {
  return value === "standard" || value === "captcha" ? value : null;
}

async function targetUser(userId: string) {
  const [target] = await db
    .select({ id: users.id, gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return target ?? null;
}

function userIdFrom(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const userId = userIdFrom(new URL(req.url).searchParams.get("userId"));
  if (!userId) {
    return Response.json({ ok: false, error: "missing_userId" }, { status: 400 });
  }
  if (!(await targetUser(userId))) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const state = parseActivityGuardState(
    await readSave(db, userId, ACTIVITY_GUARD_KEY, {}),
  );
  const now = Date.now();
  return Response.json({
    ok: true,
    turnstileConfigured: turnstileConfig().configured,
    captchaConfigured: hcaptchaConfig().configured,
    requests: Object.fromEntries(
      ACTIVITIES.map((activity) => [
        activity,
        activeManualActivityVerification(state, activity, now),
      ]),
    ),
  });
}

export async function POST(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    activity?: unknown;
    mode?: unknown;
  } | null;
  const userId = userIdFrom(body?.userId);
  const activity = guardedActivity(body?.activity);
  const mode = verificationMode(body?.mode);
  if (!userId || !activity || !mode) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!turnstileConfig().configured) {
    return Response.json(
      { ok: false, error: "verification_unconfigured" },
      { status: 409 },
    );
  }
  if (mode === "captcha" && !hcaptchaConfig().configured) {
    return Response.json(
      { ok: false, error: "captcha_unconfigured" },
      { status: 409 },
    );
  }
  const target = await targetUser(userId);
  if (!target) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const state = parseActivityGuardState(
      await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
    );
    if (organicActivityVerificationRequired(state, activity)) {
      return { ok: false as const };
    }
    const nextState = setManualActivityVerification(state, activity, mode, now);
    await upsertSave(tx, userId, ACTIVITY_GUARD_KEY, nextState);
    return {
      ok: true as const,
      request: activeManualActivityVerification(nextState, activity, now),
    };
  });
  if (!result.ok) {
    return Response.json(
      { ok: false, error: "organic_verification_pending" },
      { status: 409 },
    );
  }

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "activity-verification.manual-require",
    targetUserId: userId,
    detail: {
      gameName: target.gameName,
      activity,
      mode,
      expiresAt: result.request?.expiresAt ?? null,
    },
  });
  recordAbuseEventSoon({
    userId,
    ip: null,
    action: `v2:${activity}:human-check`,
    reason: "human_verification_required",
    detail: { manualTest: true, mode },
  });

  return Response.json({ ok: true, activity, request: result.request });
}

export async function DELETE(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    activity?: unknown;
  } | null;
  const userId = userIdFrom(body?.userId);
  const activity = guardedActivity(body?.activity);
  if (!userId || !activity) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const target = await targetUser(userId);
  if (!target) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const changed = await db.transaction(async (tx) => {
    const state = parseActivityGuardState(
      await lockSaveForUpdate(tx, userId, ACTIVITY_GUARD_KEY, {}),
    );
    const hadRequest = state.activities[activity].manualVerification !== null;
    if (hadRequest) {
      await upsertSave(
        tx,
        userId,
        ACTIVITY_GUARD_KEY,
        clearManualActivityVerification(state, activity),
      );
    }
    return hadRequest;
  });

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "activity-verification.manual-cancel",
    targetUserId: userId,
    detail: { gameName: target.gameName, activity, changed },
  });
  return Response.json({ ok: true, activity, changed });
}
