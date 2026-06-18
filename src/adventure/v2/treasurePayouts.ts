// 보물 주간 정산 페이아웃 — 순수 계산. 시즌 발굴가치 → 유저별 발굴 코인.
// 설계: docs/treasure-hunt-plan.md §7. 단일 랭킹(낚시 종별과 다름).

export type TreasurePayoutRecord = { userId: string; value: number };

// 순위별 발굴 코인 — 1-based rank. 10등 밖이면 0. (다이얼)
// 2026-06-13 ×3 상향 — 분해→코인 폐지로 코인 공급원이 주간 정산 단일화(사용자 결정).
// 1위 기준 전설 칭호(1800코인)까지 3주.
export function treasureRankCoins(rank: number): number {
  if (rank <= 0) return 0;
  if (rank === 1) return 600;
  if (rank === 2) return 400;
  if (rank === 3) return 280;
  if (rank <= 10) return 120;
  return 0;
}

// 발굴가치 내림차순 표준 경쟁 순위(1224) → 순위 코인. 0점/음수는 제외. 입력 정렬 가정 안 함.
export function computeTreasureSeasonPayouts(
  records: TreasurePayoutRecord[],
): Map<string, number> {
  const sorted = [...records].sort((a, b) => b.value - a.value);
  const payouts = new Map<string, number>();
  let rank = 0;
  let prevValue = Number.POSITIVE_INFINITY;
  sorted.forEach((r, i) => {
    if (r.value < prevValue) {
      rank = i + 1;
      prevValue = r.value;
    }
    if (r.value <= 0) return;
    const coins = treasureRankCoins(rank);
    if (coins > 0) payouts.set(r.userId, (payouts.get(r.userId) ?? 0) + coins);
  });
  return payouts;
}
