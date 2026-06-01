import { ensureUser } from "@/lib/server/ensureUser";
import { treasureSeasonBounds } from "@/lib/server/treasure/season";
import { getTreasureLeaderboard } from "@/lib/server/treasure/records";
import { readTreasureCoins } from "@/lib/server/treasure/coins";

// GET /api/v2/treasure/leaderboard — 이번 주 발굴가치 순위(top-10 + 본인 행) + 내 발굴 코인.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const bounds = treasureSeasonBounds(new Date());
  const [entries, myCoins] = await Promise.all([
    getTreasureLeaderboard(bounds.id, userId, 10),
    readTreasureCoins(userId),
  ]);
  return Response.json({
    ok: true,
    seasonId: bounds.id,
    endsAt: bounds.endAt.toISOString(),
    myCoins,
    entries,
  });
}
