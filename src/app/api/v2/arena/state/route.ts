import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pvpRatings, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { ARENA_STATE_KEY } from "@/lib/storage-keys";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import {
  arenaRankedEndsAt,
  arenaSeasonPhase,
} from "@/lib/server/pvp/arenaTournament";
import { ensureArenaTournament } from "@/lib/server/pvp/arenaTournamentService";
import {
  ARENA_MATCH_COOLDOWN_MS,
  arenaCooldownRemainingMs,
  arenaDailyMatchCount,
  arenaStaminaCostForPhase,
  parseArenaState,
} from "@/lib/server/arena";
import {
  applyRegen,
  parseStaminaFromSave,
  staminaConfigForCharacter,
} from "@/adventure/v2/stamina";

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
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, [ARENA_STATE_KEY, "character.v2"]),
      ),
    );

  const row = (key: string) => rows.find((entry) => entry.key === key)?.value;
  const state = parseArenaState(row(ARENA_STATE_KEY) ?? null);
  const character = (row("character.v2") ?? {}) as Record<string, unknown>;
  const staminaConfig = staminaConfigForCharacter(character, now.getTime());
  const stamina = applyRegen(
    parseStaminaFromSave(character.stamina, now.getTime()),
    now.getTime(),
    staminaConfig.max,
    staminaConfig.regenBonusPct,
  );
  const season = await getOrCreateCurrentSeason(now);
  const phase = arenaSeasonPhase(season.endAt, now);
  // 일요일 첫 아레나 진입도 크론 누락을 자가 복구한다. 시즌 row 잠금 + 시즌당 PK로
  // 중복 생성/보상은 발생하지 않는다.
  if (phase === "tournament") await ensureArenaTournament(now, season);
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
      // 순위표·매치 정산과 같은 현재 시즌 레이팅을 메인 점수로 표시한다.
      score: ratingRow?.rating ?? 1000,
      cooldownRemainingMs: arenaCooldownRemainingMs(state, now),
      dailyMatchCount: arenaDailyMatchCount(state, now),
      nextStaminaCost: arenaStaminaCostForPhase(state, phase, now),
      stamina,
      recentOpponents: state.recentOpponents,
      milestonesReached: state.milestonesReached,
      season: {
        id: season.id,
        startAt: season.startAt.toISOString(),
        rankedEndsAt: arenaRankedEndsAt(season.endAt).toISOString(),
        endAt: season.endAt.toISOString(),
        phase,
        rating: ratingRow?.rating ?? 1000,
        wins: ratingRow?.wins ?? 0,
        losses: ratingRow?.losses ?? 0,
        draws: ratingRow?.draws ?? 0,
      },
    },
    cooldownMs: ARENA_MATCH_COOLDOWN_MS,
  });
}
