// 낚시 주간 종별 대회 정산 — cron 이 끝난 시즌에 종별 순위 코인을 일괄 지급.
// rewardsGrantedAt 으로 idempotent(시즌당 1회). 시즌은 순수 계산이라 별도 활성 row 가 없고,
// 정산 시점에 fishing_seasons row 를 만들어 마킹한다.
//
// 지급 방식: 지갑 직접 적립이 아니라 우편함(season_reward)으로 발송 — 수령 시 코인 적립(체감·알림).
// 락 순서: fishing_seasons(FOR UPDATE) → marketplace_inbox INSERT(지갑 락 없음). cron 은 주간 실행.

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { fishingRecords, fishingSeasons, marketplaceInbox } from "@/db/schema";
import { inboxValues } from "@/lib/server/inboxPayload";
import { currentFishingSeasonId } from "./season";
import {
  computeSeasonPayouts,
  type PayoutRecord,
} from "@/adventure/v2/fishingPayouts";

export type GrantResult =
  | { kind: "ok"; seasonId: string; winners: number; total: number }
  | { kind: "already"; seasonId: string };

// 한 시즌 정산 — 트랜잭션. 시즌 row 확보·잠금 후 rewardsGrantedAt 재확인(idempotent),
// 종별 top-10 페이아웃을 유저 지갑에 적립, rewardsGrantedAt 마킹.
export async function grantFishingSeasonRewards(
  seasonId: string,
  now: Date = new Date(),
): Promise<GrantResult> {
  return db.transaction(async (tx) => {
    await tx.insert(fishingSeasons).values({ id: seasonId }).onConflictDoNothing();
    const rows = await tx
      .select()
      .from(fishingSeasons)
      .where(eq(fishingSeasons.id, seasonId))
      .for("update");
    if (rows[0]?.rewardsGrantedAt) return { kind: "already", seasonId };

    const records = await tx
      .select({
        fishId: fishingRecords.fishId,
        userId: fishingRecords.userId,
        size: fishingRecords.bestSize,
      })
      .from(fishingRecords)
      .where(eq(fishingRecords.seasonId, seasonId));

    const payouts = computeSeasonPayouts(records as PayoutRecord[]);

    let total = 0;
    let winners = 0;
    // userId 정렬 순서로 지갑을 잠근다 — 다른 시즌을 동시 정산해도 지갑 락 획득 순서가
    // 전역 일관되어 교차 잠금 데드락이 없다(Map 순회 순서로 잠그면 교차 데드락 가능).
    const sortedUserIds = [...payouts.keys()].sort();
    for (const userId of sortedUserIds) {
      const coins = payouts.get(userId) ?? 0;
      if (coins <= 0) continue;
      // 우편함으로 발송 — 수령 시 낚시 지갑에 적립(종합 집계라 rank 없음).
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: { kind: "season_reward", season: "fishing", coins },
          message: `낚시 시즌 대회 보상 — ${coins} 낚시 코인`,
        }),
      );
      total += coins;
      winners += 1;
    }

    await tx
      .update(fishingSeasons)
      .set({ rewardsGrantedAt: now, winners, totalCoins: total })
      .where(eq(fishingSeasons.id, seasonId));

    return { kind: "ok", seasonId, winners, total };
  });
}

// 미정산 시즌 일괄 처리(cron). 기록이 있는 과거 시즌(현재 시즌 != )중 rewardsGrantedAt 이
// 비어 있는 것만 — 이미 정산된 시즌은 leftJoin 으로 제외(매주 재스캔 비용 최소).
export async function grantPendingFishingRewards(
  now: Date = new Date(),
): Promise<{ results: GrantResult[] }> {
  const currentId = currentFishingSeasonId(now);
  const pending = await db
    .selectDistinct({ seasonId: fishingRecords.seasonId })
    .from(fishingRecords)
    .leftJoin(fishingSeasons, eq(fishingSeasons.id, fishingRecords.seasonId))
    .where(
      and(
        ne(fishingRecords.seasonId, currentId),
        isNull(fishingSeasons.rewardsGrantedAt),
      ),
    );

  const results: GrantResult[] = [];
  for (const s of pending) {
    results.push(await grantFishingSeasonRewards(s.seasonId, now));
  }
  return { results };
}
