// 보물 주간 발굴가치 대회 정산 — cron 이 끝난 시즌에 순위 발굴 코인을 일괄 지급.
// rewardsGrantedAt 으로 idempotent(시즌당 1회). fishing seasonRewards 미러.
//
// 지급 방식: 지갑 직접 적립이 아니라 우편함(season_reward)으로 발송 — 수령 시 코인 적립(체감·알림).
// 락 순서: treasure_seasons(FOR UPDATE) → marketplace_inbox INSERT(지갑 락 없음). cron 은 주간 실행.

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, treasureScores, treasureSeasons } from "@/db/schema";
import { inboxValues } from "@/lib/server/inboxPayload";
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
      // 우편함으로 발송 — 수령 시 보물 지갑에 적립(종합 집계라 rank 없음).
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: { kind: "season_reward", season: "treasure", coins },
          message: `보물 시즌 대회 보상 — ${coins} 보물 코인`,
        }),
      );
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
