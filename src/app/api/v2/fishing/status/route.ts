import { ensureUser } from "@/lib/server/ensureUser";
import { readFishingCatchCoinProgress } from "@/lib/server/fishing/coins";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

// GET /api/v2/fishing/status — 낚시터 진입 시 가벼운 표시용 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dailyCatchCoins = await readFishingCatchCoinProgress(
    userId,
    kstDailyKey(new Date()),
  );
  return Response.json({ ok: true, dailyCatchCoins });
}
