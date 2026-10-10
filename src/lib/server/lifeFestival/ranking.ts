// 생활 축제 순위 계산 — DB 없이 동작하는 순수 함수. 조회·정산이 같은 규칙을 쓴다.

import {
  LIFE_FESTIVAL_RANK_REWARDS,
  LIFE_FESTIVAL_RANKING_SIZE,
} from "@/adventure/data/v2/lifeFestival";
import { filterRankingEligibleRows } from "@/lib/server/rankingEligibility";

export type LifeFestivalScoreRow = {
  userId: string;
  score: number;
  updatedAt: Date | string;
  bannedUntil: Date | string | null;
};

export type RankedLifeFestivalRow<T extends LifeFestivalScoreRow> = T & {
  rank: number;
};

export function lifeFestivalRankTokens(rank: number): number {
  return LIFE_FESTIVAL_RANK_REWARDS.find((tier) => rank <= tier.maxRank)?.tokens ?? 0;
}

export function rankLifeFestivalRows<T extends LifeFestivalScoreRow>(
  rows: readonly T[],
  now: Date,
): RankedLifeFestivalRow<T>[] {
  return filterRankingEligibleRows(rows, now)
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() ||
        a.userId.localeCompare(b.userId),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function computeLifeFestivalPayouts(
  rows: readonly LifeFestivalScoreRow[],
  now: Date,
): { userId: string; rank: number; tokens: number }[] {
  return rankLifeFestivalRows(rows, now)
    .slice(0, LIFE_FESTIVAL_RANKING_SIZE)
    .map((row) => ({
      userId: row.userId,
      rank: row.rank,
      tokens: lifeFestivalRankTokens(row.rank),
    }))
    .filter((payout) => payout.tokens > 0);
}
