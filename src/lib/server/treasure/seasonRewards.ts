// 보물 주간 발굴가치 대회 정산 — cron 이 끝난 시즌에 순위 발굴 코인을 일괄 지급.
// rewardsGrantedAt 으로 idempotent(시즌당 1회). fishing seasonRewards 미러.
//
// 락 순서: treasure_seasons(FOR UPDATE) → treasure-wallet.v1(들, userId 정렬). dig/dismantle
// 경로는 treasure_seasons 를 안 잡으므로 순환 대기 없음. cron 은 주간(저트래픽) 실행.

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { treasureScores, treasureSeasons } from "@/db/schema";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  TREASURE_WALLET_KEY,
  walletCoins,
  type TreasureWallet,
} from "./coins";
import { currentTreasureSeasonId } from "./season";
import {
  computeTreasureSeasonPayouts,
  type TreasurePayoutRecord,
} from "@/adventure/v2/treasurePayouts";

export type GrantResult =
  | { kind: "ok"; seasonId: string; winners: number; total: number }
  | { kind: "already"; seasonId: string };

// 한 시즌 정산 — 트랜잭션. 시즌 row 확보·잠금 후 rewardsGrantedAt 재확인(idempotent),
// 순위 페이아웃을 유저 지갑에 적립, rewardsGrantedAt 마킹.
export async function grantTreasureSeasonRewards(
  seasonId: string,
  now: Date = new Date(),
): Promise<GrantResult> {
  return db.transaction(async (tx) => {
    await tx.insert(treasureSeasons).values({ id: seasonId }).onConflictDoNothing();
    const rows = await tx
      .select()
      .from(treasureSeasons)
      .where(eq(treasureSeasons.id, seasonId))
      .for("update");
    if (rows[0]?.rewardsGrantedAt) return { kind: "already", seasonId };

    const records = await tx
      .select({
        userId: treasureScores.userId,
        value: treasureScores.totalValue,
      })
      .from(treasureScores)
      .where(eq(treasureScores.seasonId, seasonId));

    const payouts = computeTreasureSeasonPayouts(records as TreasurePayoutRecord[]);

    let total = 0;
    let winners = 0;
    // userId 정렬 순서로 지갑 잠금 — 동시 정산 시 교차 잠금 데드락 방지.
    const sortedUserIds = [...payouts.keys()].sort();
    for (const userId of sortedUserIds) {
      const coins = payouts.get(userId) ?? 0;
      if (coins <= 0) continue;
      const wallet = await lockSaveForUpdate<TreasureWallet>(
        tx,
        userId,
        TREASURE_WALLET_KEY,
        { coins: 0 },
      );
      await upsertSave(tx, userId, TREASURE_WALLET_KEY, {
        coins: walletCoins(wallet) + coins,
      });
      total += coins;
      winners += 1;
    }

    await tx
      .update(treasureSeasons)
      .set({ rewardsGrantedAt: now, winners, totalCoins: total })
      .where(eq(treasureSeasons.id, seasonId));

    return { kind: "ok", seasonId, winners, total };
  });
}

// 미정산 시즌 일괄 처리(cron). 점수가 있는 과거 시즌(현재 시즌 != )중 rewardsGrantedAt 이
// 비어 있는 것만 — 이미 정산된 시즌은 leftJoin 으로 제외.
export async function grantPendingTreasureRewards(
  now: Date = new Date(),
): Promise<{ results: GrantResult[] }> {
  const currentId = currentTreasureSeasonId(now);
  const pending = await db
    .selectDistinct({ seasonId: treasureScores.seasonId })
    .from(treasureScores)
    .leftJoin(treasureSeasons, eq(treasureSeasons.id, treasureScores.seasonId))
    .where(
      and(
        ne(treasureScores.seasonId, currentId),
        isNull(treasureSeasons.rewardsGrantedAt),
      ),
    );

  const results: GrantResult[] = [];
  for (const s of pending) {
    results.push(await grantTreasureSeasonRewards(s.seasonId, now));
  }
  return { results };
}
