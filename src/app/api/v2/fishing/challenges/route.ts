import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import { readFishingCoins } from "@/lib/server/fishing/coins";
import {
  kstDailyKey,
  nextDailyResetAt,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  FISHING_DAILY_KEY,
  deriveFishingDailyViews,
  parseFishingDaily,
  rolloverFishingDaily,
} from "@/adventure/data/v2/fishingDailyChallenges";

// GET /api/v2/fishing/challenges — 오늘의 낚시 도전 진행 + 낚시 코인 잔액 + 다음 리셋 시각.
//   진행 카운트는 reel 이 올린다(이벤트 구동). 여기선 읽기 + lazy 롤오버 뷰만(잠금 없음).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const dayKey = kstDailyKey(now);
  const state = rolloverFishingDaily(
    parseFishingDaily(await readSave(db, userId, FISHING_DAILY_KEY, {})),
    dayKey,
  );
  const coins = await readFishingCoins(userId);
  return Response.json({
    ok: true,
    challenges: deriveFishingDailyViews(state),
    coins,
    nextResetAt: nextDailyResetAt(now),
  });
}
