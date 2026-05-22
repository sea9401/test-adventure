// POST /api/pvp/challenge
//
// 비동기 PvP 도전 — 1 호출 = 1 매치.
//
//   1) 쿨다운 60초 가드
//   2) 시즌 확보 (없으면 생성, 만료 시즌 자동 닫힘은 cron 책임)
//   3) 내 캐릭터 derive — 없으면 400
//   4) 내 레이팅 row 확보 (없으면 ELO_INITIAL)
//   5) 매칭 풀에서 상대 1명 (Elo±200→500→1000→전체). 풀 비면 봇 fallback.
//   6) [인간 상대] 상대 캐릭터 derive — race 면 503 / [봇] bot.player 사용
//   7) [인간 상대] 상대 레이팅 row 확보 / [봇] 스킵
//   8) resolveBattlePvP — 양쪽 자동 평타 (PvP 디자인: 포션 사용 불가)
//   9) outcome → a_win/d_win/draw 매핑, [인간] recordMatchAndUpdateRatings /
//      [봇] recordBotMatchAndUpdateRating (챌린저만 업데이트, 봇 rating 고정)
//  10) 응답: { outcome, me, opponent, turns, log }
//
// 보상 화폐 / 일일 캡 / 시즌 cron 은 후속 PR 범위.

import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import { derivePlayerCombatFromSaves } from "@/lib/server/derivePlayerCombatFromSaves";
import { applyStance, STANCE_META, type StanceId } from "@/adventure/character/stance";
import { resolveActor } from "@/lib/server/resolveActor";
import { getOrCreateCurrentSeason } from "@/lib/server/pvp/season";
import {
  getOrCreateRating,
  recordBotMatchAndUpdateRating,
  recordMatchAndUpdateRatings,
} from "@/lib/server/pvp/ratings";
import { pickOpponent } from "@/lib/server/pvp/matching";
import { resolveBattlePvP } from "@/adventure/battle/engine-pvp";
import type { PvPOutcome } from "@/adventure/battle/engine-pvp";
import { getNextChallengeAt } from "@/lib/server/pvp/cooldown";
import { toMyPerspective } from "@/lib/server/pvp/log";

type DbOutcome = "a_win" | "d_win" | "draw";

function pvpToDbOutcome(o: PvPOutcome): DbOutcome {
  switch (o) {
    case "p1_win":
      return "a_win";
    case "p2_win":
      return "d_win";
    case "draw":
      return "draw";
  }
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(userId, req);
  if (sessionFail) return sessionFail;

  // 쿨다운 — 60초. 비싼 시뮬레이션 전에 가장 먼저 차단.
  const nextAt = await getNextChallengeAt(userId);
  if (nextAt) {
    return Response.json(
      { error: "cooldown", nextChallengeAt: nextAt.toISOString() },
      { status: 429 },
    );
  }

  const season = await getOrCreateCurrentSeason();

  const myCombat = await derivePlayerCombatFromSaves(userId);
  if (!myCombat) {
    return new Response("character not found", { status: 400 });
  }

  const myRating = await getOrCreateRating(userId, season.id);

  const opponent = await pickOpponent({
    selfId: userId,
    myRating: myRating.rating,
    seasonId: season.id,
  });
  if (!opponent) {
    // pickOpponent 는 풀 비면 봇 fallback — 여기까지 오는 건 self 가 봇 ID 였던 가드 케이스뿐.
    return new Response("no opponents available", { status: 503 });
  }

  // 인간/봇 양쪽 모두 player + 이름 결정.
  let oppPlayer;
  let oppName: string;
  let oppStance: StanceId | null = null; // 봇은 전술 없음
  if (opponent.isBot && opponent.botPlayer) {
    oppPlayer = opponent.botPlayer;
    oppName = opponent.name;
  } else {
    const oppCombat = await derivePlayerCombatFromSaves(opponent.userId);
    if (!oppCombat) {
      // 풀 fetch 와 derive 사이에 save 가 사라진 race — 다음 호출에서 풀이 갱신됨.
      return new Response("opponent unavailable", { status: 503 });
    }
    // PvP 는 특수 전투 → 인간 상대의 전술도 적용. (봇은 derive 안 거쳐 전술 없음.)
    oppStance = oppCombat.selectedStance;
    oppPlayer = applyStance(oppCombat.player, oppCombat.selectedStance);
    await getOrCreateRating(opponent.userId, season.id);
    oppName = (await resolveActor(opponent.userId)).name;
  }

  const meActor = await resolveActor(userId);

  // PvP 는 포션 사용 불가가 디자인 결정 — 캐릭터 스탯 / 장비 / AP 스킬 빌드만으로 승부.
  // 따라서 양쪽 모두 매 턴 평타만 선택. (AP 스킬은 엔진이 슬롯 조건으로 자동 발동.)
  // 포션 풀을 빈 객체로 넘기므로 use_potion 액션이 발생해도 실제 소비/효과 없음 — 이중 가드.
  // 전술 안내 — 양측(나/상대) 전술 라벨. 한쪽이라도 켜져 있으면 전투 로그 첫머리에 노출.
  const stanceParts: string[] = [];
  if (myCombat.selectedStance) {
    stanceParts.push(`내 전술 ${STANCE_META[myCombat.selectedStance].name}`);
  }
  if (oppStance) stanceParts.push(`상대 전술 ${STANCE_META[oppStance].name}`);
  const stanceNote = stanceParts.length > 0 ? stanceParts.join(", ") : undefined;

  const resolution = resolveBattlePvP(
    applyStance(myCombat.player, myCombat.selectedStance),
    oppPlayer,
    meActor.name,
    oppName,
    {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      openingNote: stanceNote,
    },
  );

  const dbOutcome = pvpToDbOutcome(resolution.outcome);

  let attackerAfter: number;
  let defenderAfter: number;
  let coinsAwarded = 0;
  let coinBalance = 0;
  if (opponent.isBot) {
    // 봇은 rating 고정 — defenderAfter = opponent.rating.
    const result = await recordBotMatchAndUpdateRating({
      seasonId: season.id,
      attackerId: userId,
      botId: opponent.userId,
      botRating: opponent.rating,
      outcome: dbOutcome,
      log: resolution.finalState.log,
    });
    if (result.kind === "cooldown") {
      return Response.json(
        {
          error: "cooldown",
          nextChallengeAt: new Date(
            Date.now() + result.retryAfterMs,
          ).toISOString(),
        },
        { status: 429 },
      );
    }
    attackerAfter = result.attackerAfter;
    defenderAfter = opponent.rating;
    coinsAwarded = result.coinsAwarded;
    coinBalance = result.coinBalance;
  } else {
    const result = await recordMatchAndUpdateRatings({
      seasonId: season.id,
      attackerId: userId,
      defenderId: opponent.userId,
      outcome: dbOutcome,
      log: resolution.finalState.log,
    });
    if (result.kind === "cooldown") {
      return Response.json(
        {
          error: "cooldown",
          nextChallengeAt: new Date(
            Date.now() + result.retryAfterMs,
          ).toISOString(),
        },
        { status: 429 },
      );
    }
    attackerAfter = result.attackerAfter;
    defenderAfter = result.defenderAfter;
    coinsAwarded = result.coinsAwarded;
    coinBalance = result.coinBalance;
  }

  return Response.json({
    seasonId: season.id,
    outcome: dbOutcome,
    turns: resolution.turns,
    coinsAwarded,
    coinBalance,
    me: {
      name: meActor.name,
      ratingBefore: myRating.rating,
      ratingAfter: attackerAfter,
    },
    opponent: {
      userId: opponent.userId,
      name: oppName,
      ratingBefore: opponent.rating,
      ratingAfter: defenderAfter,
      isBot: opponent.isBot ?? false,
    },
    log: toMyPerspective(resolution.finalState.log, "p1"),
  });
}
