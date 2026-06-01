import { ensureUser } from "@/lib/server/ensureUser";
import { fishingSeasonBounds } from "@/lib/server/fishing/season";
import { getFishingLeaderboard } from "@/lib/server/fishing/records";

// GET /api/v2/fishing/leaderboard — 이번 주 종별 순위(top-10 + 본인 행).
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const bounds = fishingSeasonBounds(new Date());
  const byFish = await getFishingLeaderboard(bounds.id, userId, 10);
  return Response.json({
    ok: true,
    seasonId: bounds.id,
    endsAt: bounds.endAt.toISOString(),
    byFish,
  });
}
