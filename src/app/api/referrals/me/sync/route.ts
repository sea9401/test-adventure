import { db } from "@/db";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";
import { ensureOriginalUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { loadReferralTutorialSnapshot } from "@/lib/server/referralTutorialProgress";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import { readSave } from "@/lib/server/savesKv";

export async function POST(req: Request) {
  const userId = await ensureOriginalUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sessionFailure = await requireActiveDeviceSession(userId, req);
  if (sessionFailure) return sessionFailure;
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "referrals:sync",
    userLimit: 20,
    ipLimit: 200,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const result = await db.transaction(async (tx) => {
    const snapshot = await loadReferralTutorialSnapshot(tx, userId);
    const profile = await readSave<{ name?: unknown }>(
      tx,
      userId,
      "character-profile.v2",
      {},
    );
    return rewardReferralTutorialTasks(
      tx,
      userId,
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : "새 모험가",
      snapshot.taskIds,
    );
  });

  return Response.json({
    ok: true,
    staminaPotions: result.staminaPotions,
    newlyCompletedTaskIds: result.newlyCompletedTaskIds,
  });
}
