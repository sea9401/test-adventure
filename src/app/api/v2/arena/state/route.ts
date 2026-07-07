import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pvpRatings, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_STATE_KEY } from "@/lib/storage-keys";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import {
  ARENA_MATCH_COOLDOWN_MS,
  arenaCooldownRemainingMs,
  parseArenaState,
} from "@/lib/server/arena";

// GET /api/v2/arena/state — 아레나 mount fetch.
//
// 본인 Elo 점수·재도전 쿨타임 남은 시간·마일스톤 진행도(빈 배열)·이번 주 전적.
// 쿨타임은 lastMatchAt 기준 계산 — 새로고침 후에도 남은 쿨타임을 이어서 표시한다.

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const row = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, ARENA_STATE_KEY)))
    .limit(1)
    .then((rows) => rows[0]);

  const state = parseArenaState(row?.value ?? null);
  const season = await getOrCreateCurrentSeason(now);
  const ratingRow = await db
    .select({
      rating: pvpRatings.rating,
      wins: pvpRatings.wins,
      losses: pvpRatings.losses,
      draws: pvpRatings.draws,
    })
    .from(pvpRatings)
    .where(and(eq(pvpRatings.userId, userId), eq(pvpRatings.seasonId, season.id)))
    .limit(1)
    .then((rows) => rows[0]);

  return Response.json({
    ok: true,
    state: {
      score: state.score,
      cooldownRemainingMs: arenaCooldownRemainingMs(state, now),
      recentOpponents: state.recentOpponents,
      milestonesReached: state.milestonesReached,
      season: {
        id: season.id,
        startAt: season.startAt.toISOString(),
        endAt: season.endAt.toISOString(),
        rating: ratingRow?.rating ?? 1000,
        wins: ratingRow?.wins ?? 0,
        losses: ratingRow?.losses ?? 0,
        draws: ratingRow?.draws ?? 0,
      },
    },
    cooldownMs: ARENA_MATCH_COOLDOWN_MS,
  });
}
