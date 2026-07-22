import { ensureUser } from "@/lib/server/ensureUser";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import {
  arenaRankedEndsAt,
  arenaSeasonPhase,
} from "@/lib/server/pvp/arenaTournament";
import {
  arenaTournamentBetView,
  ensureArenaTournament,
  latestArenaTournament,
} from "@/lib/server/pvp/arenaTournamentService";

// GET /api/v2/arena/tournament — 현재 일요일 토너먼트 또는 가장 최근 결과.
// 일요일 첫 조회는 크론 누락에 대비해 시즌 row 잠금 아래에서 토너먼트를 한 번만 생성한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const season = await getOrCreateCurrentSeason(now);
  const phase = arenaSeasonPhase(season.endAt, now);
  const current =
    phase === "tournament" ? await ensureArenaTournament(now) : null;
  const latest =
    current?.kind === "ok"
      ? { seasonId: current.seasonId, bracket: current.bracket }
      : await latestArenaTournament();
  const myReward = latest?.bracket.rewards.find(
    (reward) => reward.userId === userId,
  );
  const betting = latest
    ? await arenaTournamentBetView(latest.seasonId, userId)
    : null;

  return Response.json({
    ok: true,
    phase,
    season: {
      id: season.id,
      rankedEndsAt: arenaRankedEndsAt(season.endAt).toISOString(),
      endAt: season.endAt.toISOString(),
    },
    tournament: latest
      ? {
          seasonId: latest.seasonId,
          isCurrent: latest.seasonId === season.id,
          bracket: latest.bracket,
          myReward: myReward ?? null,
          betting,
        }
      : null,
  });
}
