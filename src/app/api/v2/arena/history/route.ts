import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { pvpRatings, pvpSeasons, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_HISTORY_KEY } from "@/lib/storage-keys";
import {
  parseArenaHistory,
  type ArenaHistoryEntry,
  type ArenaMatchOutcome,
} from "@/lib/server/arena";

const SEASON_HISTORY_LIMIT = 8;
const OPPONENT_RECORD_LIMIT = 5;

type OpponentRecord = {
  key: string;
  name: string;
  level: number;
  userId?: string;
  botId?: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  lastAt: string;
};

function addOutcome(
  rec: { wins: number; losses: number; draws: number },
  outcome: ArenaMatchOutcome,
) {
  if (outcome === "win") rec.wins += 1;
  else if (outcome === "loss") rec.losses += 1;
  else rec.draws += 1;
}

function opponentRecords(history: ArenaHistoryEntry[]): OpponentRecord[] {
  const grouped = new Map<string, OpponentRecord>();
  for (const h of history) {
    const key =
      h.opponent.userId ??
      h.opponent.botId ??
      `${h.opponent.name}:${h.opponent.level}`;
    const prev =
      grouped.get(key) ??
      ({
        key,
        name: h.opponent.name || "상대",
        level: h.opponent.level ?? 1,
        userId: h.opponent.userId,
        botId: h.opponent.botId,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        lastAt: h.at,
      } satisfies OpponentRecord);
    prev.matches += 1;
    addOutcome(prev, h.outcome);
    if (new Date(h.at).getTime() > new Date(prev.lastAt).getTime()) {
      prev.lastAt = h.at;
    }
    grouped.set(key, prev);
  }
  return [...grouped.values()]
    .sort(
      (a, b) =>
        b.matches - a.matches ||
        new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
    )
    .slice(0, OPPONENT_RECORD_LIMIT);
}

// GET /api/v2/arena/history — 최근 전투 기록(리플레이 포함, 다시보기용).
//   리플레이 로그가 무거워 mount fetch(state)와 분리 — 아레나 진입 시 state 와 병렬로 받는다.
//   read-only(락 불필요). 매치 POST 응답의 historyEntry 로 클라가 낙관적 prepend 도 한다.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_HISTORY_KEY)))
    .limit(1)
    .then((rows) => rows[0]);
  const history = parseArenaHistory(row?.value ?? null);

  const now = new Date();
  const seasons = await db
    .select({
      id: pvpSeasons.id,
      startAt: pvpSeasons.startAt,
      endAt: pvpSeasons.endAt,
    })
    .from(pvpSeasons)
    .where(lt(pvpSeasons.endAt, now))
    .orderBy(desc(pvpSeasons.endAt))
    .limit(SEASON_HISTORY_LIMIT);

  const seasonIds = seasons.map((s) => s.id);
  const ratings =
    seasonIds.length > 0
      ? await db
          .select({
            userId: pvpRatings.userId,
            seasonId: pvpRatings.seasonId,
            rating: pvpRatings.rating,
            wins: pvpRatings.wins,
            losses: pvpRatings.losses,
            draws: pvpRatings.draws,
          })
          .from(pvpRatings)
          .where(inArray(pvpRatings.seasonId, seasonIds))
      : [];
  const ratingsBySeason = new Map<string, typeof ratings>();
  for (const r of ratings) {
    const list = ratingsBySeason.get(r.seasonId) ?? [];
    list.push(r);
    ratingsBySeason.set(r.seasonId, list);
  }

  const seasonsSummary = seasons
    .map((season) => {
      const list = (ratingsBySeason.get(season.id) ?? []).sort(
        (a, b) =>
          b.rating - a.rating ||
          b.wins - a.wins ||
          (a.userId < b.userId ? -1 : 1),
      );
      const index = list.findIndex((r) => r.userId === userId);
      const mine = index >= 0 ? list[index] : null;
      if (!mine) return null;
      return {
        seasonId: season.id,
        startAt: season.startAt.toISOString(),
        endAt: season.endAt.toISOString(),
        rank: index + 1,
        totalRanked: list.length,
        rating: mine.rating,
        wins: mine.wins,
        losses: mine.losses,
        draws: mine.draws,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null);

  return Response.json({
    ok: true,
    history,
    seasons: seasonsSummary,
    opponentRecords: opponentRecords(history),
  });
}
