// 시즌 종료 순위별 투기장 코인 보상 — cron 이 닫힌 시즌에 일괄 지급.
// rewardsGrantedAt 으로 idempotent (시즌당 1회). 매치 지급(일일 캡)과 달리 캡 무시 — 시즌 정산 보너스.
//
// 지급 방식: 지갑 직접 적립이 아니라 **우편함(season_reward)** 으로 발송 — 플레이어가 수령
// 시 코인이 적립된다(체감·알림). 락 순서: pvp_seasons(FOR UPDATE) → marketplace_inbox INSERT
// (지갑 락 없음). cron 은 주간 롤오버(저트래픽) 실행.

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox, pvpRatings, pvpSeasons } from "@/db/schema";
import { inboxValues } from "@/lib/server/inboxPayload";
import { closeExpiredSeasons } from "./season";

// 순위 보상표(코인). 작은 유저 풀 기준 초안 — 후속 튜닝 다이얼. 상점 가격(200~2500)과 연동.
// rating DESC 순위(1-based) → 코인. 동률은 순차 순위(향후 dense rank 필요 시 보강).
export const SEASON_REWARD_TIERS: readonly { maxRank: number; coins: number }[] = [
  { maxRank: 1, coins: 1000 },
  { maxRank: 3, coins: 600 },
  { maxRank: 10, coins: 300 },
  { maxRank: Infinity, coins: 100 }, // 참가 보상 (시즌 레이팅 row 보유 = 참가)
];

/** 최종 순위(1-based) → 시즌 보상 코인. */
export function seasonRewardForRank(rank: number): number {
  for (const t of SEASON_REWARD_TIERS) {
    if (rank <= t.maxRank) return t.coins;
  }
  return 0;
}

export type GrantSeasonRewardsResult =
  | { kind: "ok"; seasonId: string; granted: number; total: number }
  | { kind: "missing" }
  | { kind: "not_closed" }
  | { kind: "already" };

/**
 * 한 시즌 순위 보상 지급 — 트랜잭션. 시즌 row 잠그고 rewardsGrantedAt 재확인(idempotent),
 * 레이팅 순위대로 각 지갑에 코인 적립(캡 무시), rewardsGrantedAt 마킹.
 */
export async function grantSeasonRewards(
  seasonId: string,
  now: Date = new Date(),
): Promise<GrantSeasonRewardsResult> {
  return db.transaction(async (tx) => {
    const seasonRows = await tx
      .select()
      .from(pvpSeasons)
      .where(eq(pvpSeasons.id, seasonId))
      .for("update");
    const season = seasonRows[0];
    if (!season) return { kind: "missing" };
    if (season.status !== "closed") return { kind: "not_closed" };
    if (season.rewardsGrantedAt) return { kind: "already" };

    const ranked = await tx
      .select({ userId: pvpRatings.userId })
      .from(pvpRatings)
      .where(eq(pvpRatings.seasonId, seasonId))
      .orderBy(desc(pvpRatings.rating));

    let granted = 0;
    let total = 0;
    for (let i = 0; i < ranked.length; i += 1) {
      const coins = seasonRewardForRank(i + 1);
      if (coins <= 0) continue;
      const userId = ranked[i].userId;
      const rank = i + 1;
      // 우편함으로 발송 — 수령 시 투기장 지갑에 적립(claim 핸들러가 season 으로 분기).
      await tx.insert(marketplaceInbox).values(
        inboxValues({
          userId,
          payload: { kind: "season_reward", season: "pvp", coins, rank },
          message: `투기장 시즌 순위 보상 (${rank}위) — ${coins} 코인`,
        }),
      );
      granted += 1;
      total += coins;
    }

    await tx
      .update(pvpSeasons)
      .set({ rewardsGrantedAt: now })
      .where(eq(pvpSeasons.id, seasonId));

    return { kind: "ok", seasonId, granted, total };
  });
}

/**
 * 보상 미지급 시즌 일괄 처리 (cron). 먼저 만료 시즌을 닫고(self-sufficient), 닫혔지만
 * rewardsGrantedAt 이 비어 있는 시즌 전부에 grantSeasonRewards.
 */
export async function grantPendingSeasonRewards(
  now: Date = new Date(),
): Promise<{ closed: number; results: GrantSeasonRewardsResult[] }> {
  const closed = await closeExpiredSeasons(now);
  const pending = await db
    .select({ id: pvpSeasons.id })
    .from(pvpSeasons)
    .where(and(eq(pvpSeasons.status, "closed"), isNull(pvpSeasons.rewardsGrantedAt)));
  const results: GrantSeasonRewardsResult[] = [];
  for (const s of pending) {
    results.push(await grantSeasonRewards(s.id, now));
  }
  return { closed, results };
}
