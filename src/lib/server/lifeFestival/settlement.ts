// 생활 축제 주간 순위 정산 — cron 이 끝난 주의 상위 30명에게 축제 증표 우편을 보낸다.
// 낚시 시즌 정산(fishing/seasonRewards.ts)과 같은 구조: 주차 마커 행 FOR UPDATE →
// rewardsGrantedAt 확인(주당 1회) → 우편 INSERT(userId 정렬) → 마킹.

import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  lifeFestivalScores,
  lifeFestivalWeeks,
  marketplaceInbox,
  users,
} from "@/db/schema";
import { inboxValues } from "@/lib/server/inboxPayload";
import { kstWeekMondayKey } from "@/lib/kst";
import { computeLifeFestivalPayouts } from "./ranking";

export type LifeFestivalGrantResult =
  | { kind: "ok"; weekId: string; winners: number; total: number }
  | { kind: "already"; weekId: string };

export async function grantLifeFestivalWeekRewards(
  weekId: string,
  now: Date = new Date(),
): Promise<LifeFestivalGrantResult> {
  return db.transaction(async (tx) => {
    await tx.insert(lifeFestivalWeeks).values({ id: weekId }).onConflictDoNothing();
    const marker = await tx
      .select()
      .from(lifeFestivalWeeks)
      .where(eq(lifeFestivalWeeks.id, weekId))
      .for("update");
    if (marker[0]?.rewardsGrantedAt) return { kind: "already", weekId };

    const rows = await tx
      .select({
        userId: lifeFestivalScores.userId,
        score: lifeFestivalScores.score,
        updatedAt: lifeFestivalScores.updatedAt,
        bannedUntil: users.bannedUntil,
      })
      .from(lifeFestivalScores)
      .innerJoin(users, eq(users.id, lifeFestivalScores.userId))
      .where(eq(lifeFestivalScores.weekId, weekId));

    const payouts = computeLifeFestivalPayouts(rows, now).sort((a, b) =>
      a.userId.localeCompare(b.userId),
    );
    let total = 0;
    for (const payout of payouts) {
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId: payout.userId,
          payload: {
            kind: "season_reward",
            season: "life_festival",
            coins: payout.tokens,
            rank: payout.rank,
          },
          message: `생활 축제 주간 순위 보상 (${payout.rank}위 · 증표 ${payout.tokens}개)`,
        }),
      );
      total += payout.tokens;
    }

    await tx
      .update(lifeFestivalWeeks)
      .set({ rewardsGrantedAt: now, winners: payouts.length, totalTokens: total })
      .where(eq(lifeFestivalWeeks.id, weekId));

    return { kind: "ok", weekId, winners: payouts.length, total };
  });
}

export async function grantPendingLifeFestivalRewards(
  now: Date = new Date(),
): Promise<{ results: LifeFestivalGrantResult[] }> {
  const currentWeekId = kstWeekMondayKey(now);
  const pending = await db
    .selectDistinct({ weekId: lifeFestivalScores.weekId })
    .from(lifeFestivalScores)
    .leftJoin(lifeFestivalWeeks, eq(lifeFestivalWeeks.id, lifeFestivalScores.weekId))
    .where(
      and(
        ne(lifeFestivalScores.weekId, currentWeekId),
        isNull(lifeFestivalWeeks.rewardsGrantedAt),
      ),
    );

  const results: LifeFestivalGrantResult[] = [];
  for (const { weekId } of pending) {
    if (weekId >= currentWeekId) continue;
    results.push(await grantLifeFestivalWeekRewards(weekId, now));
  }
  return { results };
}
