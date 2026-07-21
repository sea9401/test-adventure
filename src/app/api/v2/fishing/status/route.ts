import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readFishingCatchCoinProgress } from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import { readActiveAutoGatheringActivity } from "@/lib/server/lifeActivityLock";

// GET /api/v2/fishing/status — 낚시터 진입 시 가벼운 표시용 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [dailyCatchCoins, activeAutoActivity] = await Promise.all([
    readFishingCatchCoinProgress(userId, kstDailyKey(new Date())),
    readActiveAutoGatheringActivity(db, userId),
  ]);
  return Response.json({ ok: true, dailyCatchCoins, activeAutoActivity });
}
