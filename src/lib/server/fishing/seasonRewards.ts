// 낚시 주간 종별 대회 정산 — cron 이 끝난 시즌에 종별 순위 코인을 일괄 지급.
// rewardsGrantedAt 으로 idempotent(시즌당 1회). 시즌은 순수 계산이라 별도 활성 row 가 없고,
// 정산 시점에 fishing_seasons row 를 만들어 마킹한다.
//
// 락 순서: fishing_seasons(FOR UPDATE) → fishing-wallet.v1(들). reel 경로는 둘 다 안 잡으므로
// (session/codex/records 만 건드림) 순환 대기 없음. cron 은 주간(저트래픽) 실행.

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { fishingRecords, fishingSeasons } from "@/db/schema";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FISHING_WALLET_KEY,
  walletCoins,
  type FishingWallet,
} from "./coins";
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
      const wallet = await lockSaveForUpdate<FishingWallet>(
        tx,
        userId,
        FISHING_WALLET_KEY,
        { coins: 0 },
      );
      await upsertSave(tx, userId, FISHING_WALLET_KEY, {
        coins: walletCoins(wallet) + coins,
      });
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
