// 주간 정산 페이아웃 — 순수 계산. 시즌 기록 → 유저별 낚시 코인 합계.
// 설계: docs/fishing-content-plan.md §5

import { isFishId, recordCoinForRank } from "@/adventure/data/v2/fish";

export type PayoutRecord = { fishId: string; userId: string; size: number };

// 종별 사이즈 내림차순 위치 rank → recordCoinForRank(top-10 밖은 0). 유저별 합산.
// 한 명이 여러 종을 석권하면 누적. 알 수 없는 어종 id 는 무시. 입력 정렬 가정 안 함.
export function computeSeasonPayouts(records: PayoutRecord[]): Map<string, number> {
  const byFish = new Map<string, PayoutRecord[]>();
  for (const r of records) {
    if (!isFishId(r.fishId)) continue;
    const g = byFish.get(r.fishId);
    if (g) g.push(r);
    else byFish.set(r.fishId, [r]);
  }
  const payouts = new Map<string, number>();
  for (const [fishId, list] of byFish) {
    if (!isFishId(fishId)) continue;
    list.sort((a, b) => b.size - a.size);
    // 표준 경쟁 순위(1224) — 같은 사이즈는 같은 순위로 동등 시상(동률이 경계에서 운으로
    // 갈리지 않게). 다음 순위는 건너뛴다.
    let rank = 0;
    let prevSize = Number.POSITIVE_INFINITY;
    list.forEach((r, i) => {
      if (r.size < prevSize) {
        rank = i + 1;
        prevSize = r.size;
      }
      const coins = recordCoinForRank(fishId, rank);
      if (coins > 0) payouts.set(r.userId, (payouts.get(r.userId) ?? 0) + coins);
    });
  }
  return payouts;
}
