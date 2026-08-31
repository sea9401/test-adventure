import { db } from "@/db";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import { loadReferralTutorialSnapshot } from "@/lib/server/referralTutorialProgress";
import {
  attributeReferral,
  normalizeReferralInput,
  rewardReferralTutorialTasks,
} from "@/lib/server/referrals";
import { readSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";

export async function POST(req: Request) {
  const userId = await ensureOriginalUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sessionFailure = await requireActiveDeviceSession(userId, req);
  if (sessionFailure) return sessionFailure;

  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "referrals:attribute",
    userLimit: 10,
    ipLimit: 100,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    referral?: unknown;
  } | null;
  const code = normalizeReferralInput(body?.referral);
  if (!code) {
    return Response.json(
      { ok: false, error: "invalid_referral" },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const profile = await readSave<{ name?: unknown }>(
      tx,
      userId,
      "character-profile.v2",
      {},
    );
    const name =
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : "새 모험가";
    const attributed = await attributeReferral(tx, userId, code, name);
    if (!attributed.attributed) return attributed;

    const snapshot = await loadReferralTutorialSnapshot(tx, userId);
    const reward = await rewardReferralTutorialTasks(
      tx,
      userId,
      name,
      snapshot.taskIds,
    );
    return { attributed: true as const, reward };
  });

  if (!result.attributed) {
    const error =
      result.reason === "invalid_code" ? "invalid_referral" : result.reason;
    return Response.json(
      { ok: false, error },
      { status: result.reason === "invalid_code" ? 400 : 409 },
    );
  }

  return Response.json({
    ok: true,
    staminaPotions: result.reward.staminaPotions,
    newlyCompletedTaskIds: result.reward.newlyCompletedTaskIds,
  });
}
