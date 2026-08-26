import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readFishingCatchCoinProgress } from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import { readActiveAutoGatheringActivity } from "@/lib/server/lifeActivityLock";
import { readSave } from "@/lib/server/savesKv";
import {
  FISHING_STOCK_KEY,
  emptyFishingStock,
  fishingCatchItemDailyProgress,
  parseFishingStock,
} from "@/adventure/v2/fishingStock";

// GET /api/v2/fishing/status — 낚시터 진입 시 가벼운 표시용 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dayKey = kstDailyKey(new Date());
  const [dailyCatchCoins, activeAutoActivity, fishingStockRaw] = await Promise.all([
    readFishingCatchCoinProgress(userId, dayKey),
    readActiveAutoGatheringActivity(db, userId),
    readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
  ]);
  const dailyCatchItems = fishingCatchItemDailyProgress(
    parseFishingStock(fishingStockRaw),
    dayKey,
  );
  return Response.json({
    ok: true,
    dailyCatchCoins,
    dailyCatchItems,
    activeAutoActivity,
  });
}
