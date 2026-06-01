import { ensureUser } from "@/lib/server/ensureUser";
import { fishingSeasonBounds } from "@/lib/server/fishing/season";
import { getFishingLeaderboard } from "@/lib/server/fishing/records";
import { readFishingCoins } from "@/lib/server/fishing/coins";

// GET /api/v2/fishing/leaderboard — 이번 주 종별 순위(top-10 + 본인 행) + 내 낚시 코인 잔액.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const bounds = fishingSeasonBounds(new Date());
  const [byFish, myCoins] = await Promise.all([
    getFishingLeaderboard(bounds.id, userId, 10),
    readFishingCoins(userId),
  ]);
  return Response.json({
    ok: true,
    seasonId: bounds.id,
    endsAt: bounds.endAt.toISOString(),
    myCoins,
    byFish,
  });
}
