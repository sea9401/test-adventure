// PvP 시즌별 레이팅 row 의 CRUD.
//
// 매칭/도전 API (PR-3) 가 매 호출마다:
//   1) getCurrentSeason() 으로 시즌 고정
//   2) getOrCreateRating(myId, seasonId) — 본인 row (없으면 1000 초기화)
//   3) 매칭 후보 1명 선출 — 그 후보의 row 도 getOrCreateRating
//   4) PvP 시뮬 → applyEloMatch → 양쪽 rating 업데이트 + pvpMatches INSERT
//
// dailyEarned / dailyResetAt 은 보상 화폐 「투기장 코인」 의 일일 캡 추적용 (KST 자정 리셋).
// 코인 잔액은 saves_kv PVP_WALLET_KEY 에 영속 — recordMatch 트랜잭션 안에서 같이 갱신(원자적).

import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { pvpMatches, pvpRatings } from "@/db/schema";
import { ELO_INITIAL, applyEloMatch, computeNewRating } from "./elo";
import { CHALLENGE_COOLDOWN_MS } from "./cooldown";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  PVP_WALLET_KEY,
  type PvpWallet,
  coinRewardFor,
  applyDailyCappedCoins,
} from "./coins";

export type PvPRatingRow = typeof pvpRatings.$inferSelect;
export type PvPMatchRow = typeof pvpMatches.$inferSelect;

// 매치 기록 결과 — cooldown race 시 "cooldown" 으로 분기.
// (C3 fix: tx 밖에서의 cooldown 체크는 더블 submit 시 양쪽 다 통과해 매치 중복 생성.
//  여기선 attacker rating row 를 FOR UPDATE 로 잡고 그 안에서 최근 매치를 한 번 더 확인.)
// coinsAwarded = 이번 매치 지급 코인(일일 캡 반영), coinBalance = 지급 후 총 잔액.
export type RecordMatchResult =
  | {
      kind: "ok";
      attackerAfter: number;
      defenderAfter: number;
      coinsAwarded: number;
      coinBalance: number;
    }
  | { kind: "cooldown"; retryAfterMs: number };

export type RecordBotMatchResult =
  | { kind: "ok"; attackerAfter: number; coinsAwarded: number; coinBalance: number }
  | { kind: "cooldown"; retryAfterMs: number };

// 챌린저(attacker) 의 잠긴 rating row + 매치 결과로 코인 지급. dailyEarned/dailyResetAt 갱신은
// 호출부의 pvp_ratings UPDATE 에 합치고(여기선 계산만), wallet read-modify-write 만 수행.
// 반환: { awarded, balance, newDailyEarned, newResetAt }.
async function grantCoinsTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  attackerId: string,
  attackerRow: PvPRatingRow,
  outcome: "a_win" | "d_win" | "draw",
  isBot: boolean,
  now: Date,
): Promise<{ awarded: number; balance: number; newDailyEarned: number; newResetAt: Date }> {
  const base = coinRewardFor(outcome, isBot);
  const { awarded, newDailyEarned, newResetAt } = applyDailyCappedCoins(
    attackerRow.dailyEarned,
    attackerRow.dailyResetAt,
    base,
    now,
  );
  let balance = 0;
  if (awarded > 0) {
    const wallet = await lockSaveForUpdate<PvpWallet>(tx, attackerId, PVP_WALLET_KEY, {
      coins: 0,
    });
    balance = (typeof wallet.coins === "number" ? wallet.coins : 0) + awarded;
    await upsertSave(tx, attackerId, PVP_WALLET_KEY, { coins: balance });
  } else {
    const wallet = await lockSaveForUpdate<PvpWallet>(tx, attackerId, PVP_WALLET_KEY, {
      coins: 0,
    });
    balance = typeof wallet.coins === "number" ? wallet.coins : 0;
  }
  return { awarded, balance, newDailyEarned, newResetAt };
}

// 시즌별 유저 레이팅 row. 없으면 ELO_INITIAL=1000 으로 INSERT. PK race 안전.
export async function getOrCreateRating(
  userId: string,
  seasonId: string,
): Promise<PvPRatingRow> {
  const existing = await db
    .select()
    .from(pvpRatings)
    .where(
      and(eq(pvpRatings.userId, userId), eq(pvpRatings.seasonId, seasonId)),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(pvpRatings)
    .values({ userId, seasonId, rating: ELO_INITIAL })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  // race — 다른 요청이 먼저 insert.
  const refetch = await db
    .select()
    .from(pvpRatings)
    .where(
      and(eq(pvpRatings.userId, userId), eq(pvpRatings.seasonId, seasonId)),
    )
    .limit(1);
  if (!refetch[0]) {
    throw new Error(`pvp rating ${userId}/${seasonId} missing after race`);
  }
  return refetch[0];
}

// 매치 1건 처리 — 양쪽 rating 갱신 + matches row 1건 INSERT. tx 1개로 묶음.
// 호출 측은 이미 PvP 엔진을 돌려 outcome 결정한 상태로 진입.
export async function recordMatchAndUpdateRatings(args: {
  seasonId: string;
  attackerId: string;
  defenderId: string;
  outcome: "a_win" | "d_win" | "draw";
  log: unknown; // PvPBattleState["log"] — jsonb 로 저장
}): Promise<RecordMatchResult> {
  return db.transaction(async (tx) => {
    // H1 fix: rating row 잠금 순서를 userId 사전순으로 정규화. A→B / B→A 가 동시이면
    // 기존 코드는 양쪽 다 "attacker → defender" 순으로 잡아 데드락. 이제 항상 min(id) → max(id).
    const [firstId, secondId] =
      args.attackerId < args.defenderId
        ? [args.attackerId, args.defenderId]
        : [args.defenderId, args.attackerId];

    const firstRows = await tx
      .select()
      .from(pvpRatings)
      .where(
        and(
          eq(pvpRatings.userId, firstId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      )
      .for("update");
    const secondRows = await tx
      .select()
      .from(pvpRatings)
      .where(
        and(
          eq(pvpRatings.userId, secondId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      )
      .for("update");

    const a = firstId === args.attackerId ? firstRows[0] : secondRows[0];
    const d = firstId === args.attackerId ? secondRows[0] : firstRows[0];
    if (!a || !d) {
      throw new Error("pvp ratings missing — getOrCreateRating 호출 누락");
    }

    // C3 fix: attacker rating row 를 lock 한 상태에서 최근 매치 다시 확인.
    // 같은 attacker 의 동시 challenge 요청들은 여기서 직렬화 → 두 번째 요청은 첫 매치를 보고 429.
    const recent = await tx
      .select({ createdAt: pvpMatches.createdAt })
      .from(pvpMatches)
      .where(eq(pvpMatches.attackerId, args.attackerId))
      .orderBy(desc(pvpMatches.createdAt))
      .limit(1);
    if (recent[0]) {
      const elapsed = Date.now() - recent[0].createdAt.getTime();
      if (elapsed < CHALLENGE_COOLDOWN_MS) {
        return { kind: "cooldown", retryAfterMs: CHALLENGE_COOLDOWN_MS - elapsed };
      }
    }

    const { attackerAfter, defenderAfter } = applyEloMatch(
      a.rating,
      d.rating,
      args.outcome,
    );

    const now = new Date();
    // 코인 지급 — 챌린저(attacker) 만. 일일 캡은 attacker rating row 의 dailyEarned/dailyResetAt.
    const coins = await grantCoinsTx(tx, args.attackerId, a, args.outcome, false, now);

    await tx
      .update(pvpRatings)
      .set({
        rating: attackerAfter,
        wins: args.outcome === "a_win" ? a.wins + 1 : a.wins,
        losses: args.outcome === "d_win" ? a.losses + 1 : a.losses,
        draws: args.outcome === "draw" ? a.draws + 1 : a.draws,
        dailyEarned: coins.newDailyEarned,
        dailyResetAt: coins.newResetAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(pvpRatings.userId, args.attackerId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      );

    await tx
      .update(pvpRatings)
      .set({
        rating: defenderAfter,
        wins: args.outcome === "d_win" ? d.wins + 1 : d.wins,
        losses: args.outcome === "a_win" ? d.losses + 1 : d.losses,
        draws: args.outcome === "draw" ? d.draws + 1 : d.draws,
        updatedAt: now,
      })
      .where(
        and(
          eq(pvpRatings.userId, args.defenderId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      );

    await tx.insert(pvpMatches).values({
      seasonId: args.seasonId,
      attackerId: args.attackerId,
      defenderId: args.defenderId,
      outcome: args.outcome,
      attackerRatingBefore: a.rating,
      defenderRatingBefore: d.rating,
      attackerRatingAfter: attackerAfter,
      defenderRatingAfter: defenderAfter,
      log: args.log as object,
    });

    return {
      kind: "ok",
      attackerAfter,
      defenderAfter,
      coinsAwarded: coins.awarded,
      coinBalance: coins.balance,
    };
  });
}

// 봇 매치 전용 — 챌린저 측 rating 만 업데이트하고 봇의 고정 rating 으로 pvpMatches row 박는다.
// 봇은 pvp_ratings row 가 없으므로 그쪽 select/update 는 스킵. 봇 rating 은 항상 before==after.
export async function recordBotMatchAndUpdateRating(args: {
  seasonId: string;
  attackerId: string;
  botId: string;
  botRating: number;
  outcome: "a_win" | "d_win" | "draw";
  log: unknown;
}): Promise<RecordBotMatchResult> {
  return db.transaction(async (tx) => {
    const aRows = await tx
      .select()
      .from(pvpRatings)
      .where(
        and(
          eq(pvpRatings.userId, args.attackerId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      )
      .for("update");
    const a = aRows[0];
    if (!a) {
      throw new Error("pvp rating missing — getOrCreateRating 호출 누락");
    }

    // C3 fix: 봇 매치도 동일하게 attacker rating row lock 하에서 최근 매치 재확인.
    const recent = await tx
      .select({ createdAt: pvpMatches.createdAt })
      .from(pvpMatches)
      .where(eq(pvpMatches.attackerId, args.attackerId))
      .orderBy(desc(pvpMatches.createdAt))
      .limit(1);
    if (recent[0]) {
      const elapsed = Date.now() - recent[0].createdAt.getTime();
      if (elapsed < CHALLENGE_COOLDOWN_MS) {
        return { kind: "cooldown", retryAfterMs: CHALLENGE_COOLDOWN_MS - elapsed };
      }
    }

    const aResult =
      args.outcome === "a_win"
        ? "win"
        : args.outcome === "d_win"
          ? "loss"
          : "draw";
    const attackerAfter = computeNewRating(a.rating, args.botRating, aResult);

    const now = new Date();
    // 코인 지급 — 봇 상대라 isBot=true (×0.5 디스카운트).
    const coins = await grantCoinsTx(tx, args.attackerId, a, args.outcome, true, now);

    await tx
      .update(pvpRatings)
      .set({
        rating: attackerAfter,
        wins: args.outcome === "a_win" ? a.wins + 1 : a.wins,
        losses: args.outcome === "d_win" ? a.losses + 1 : a.losses,
        draws: args.outcome === "draw" ? a.draws + 1 : a.draws,
        dailyEarned: coins.newDailyEarned,
        dailyResetAt: coins.newResetAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(pvpRatings.userId, args.attackerId),
          eq(pvpRatings.seasonId, args.seasonId),
        ),
      );

    await tx.insert(pvpMatches).values({
      seasonId: args.seasonId,
      attackerId: args.attackerId,
      defenderId: args.botId,
      outcome: args.outcome,
      attackerRatingBefore: a.rating,
      defenderRatingBefore: args.botRating,
      attackerRatingAfter: attackerAfter,
      defenderRatingAfter: args.botRating, // 봇은 고정
      log: args.log as object,
    });

    return {
      kind: "ok",
      attackerAfter,
      coinsAwarded: coins.awarded,
      coinBalance: coins.balance,
    };
  });
}

// 시즌 순위표. partial=true 면 본인 위/아래 N명만, 아니면 절대 top.
export async function getSeasonLeaderboard(
  seasonId: string,
  limit: number = 50,
): Promise<PvPRatingRow[]> {
  return db
    .select()
    .from(pvpRatings)
    .where(eq(pvpRatings.seasonId, seasonId))
    .orderBy(desc(pvpRatings.rating))
    .limit(limit);
}

// 본인 최근 매치 N건 — attacker 든 defender 든 포함. 매치 카드 UI 표시용.
// (attacker / defender 양쪽 인덱스 있어 PG 가 OR → bitmap scan 으로 처리.)
export async function getMyRecentMatches(
  userId: string,
  limit: number = 20,
): Promise<PvPMatchRow[]> {
  return db
    .select()
    .from(pvpMatches)
    .where(
      or(eq(pvpMatches.attackerId, userId), eq(pvpMatches.defenderId, userId)),
    )
    .orderBy(desc(pvpMatches.createdAt))
    .limit(limit);
}
