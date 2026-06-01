// 보물 주간 발굴가치 리더보드 — 순수 셰이핑 + 공용 타입. 서버(쿼리 가공)·클라(뷰)·dev(mock) 공용.
//
// 설계: docs/treasure-hunt-plan.md §7. 낚시(종별)와 달리 단일 랭킹 — 그 주에 발굴한 골동품의
// 결정적 감정가 합계(시장가 아님 → 조작 방지)로 순위.

export type TreasureLeaderboardRow = {
  userId: string;
  name: string | null;
  value: number;
};

export type TreasureLeaderboardEntry = {
  rank: number;
  name: string;
  value: number;
  isMe: boolean;
};

export type TreasureLeaderboardData = {
  seasonId: string;
  endsAt: string; // ISO
  /** 내 발굴 코인 잔액(주간 정산으로도 적립). */
  myCoins: number;
  /** 발굴가치 내림차순 엔트리. top-N + (top 밖이면) 본인 행만. */
  entries: TreasureLeaderboardEntry[];
};

// rows 는 발굴가치 내림차순으로 들어온다고 가정(쿼리가 ORDER BY total_value DESC).
// 표준 경쟁 순위(1224) — 같은 값은 같은 순위(정산 computeTreasureSeasonPayouts 와 일치).
export function shapeTreasureLeaderboard(
  rows: TreasureLeaderboardRow[],
  meUserId: string,
  topN: number = 10,
): TreasureLeaderboardEntry[] {
  const entries: TreasureLeaderboardEntry[] = [];
  let rank = 0;
  let prevValue = Number.POSITIVE_INFINITY;
  rows.forEach((r, i) => {
    if (r.value < prevValue) {
      rank = i + 1;
      prevValue = r.value;
    }
    const isMe = r.userId === meUserId;
    if (rank <= topN || isMe) {
      entries.push({
        rank,
        name: (r.name ?? "").trim() || "모험가",
        value: r.value,
        isMe,
      });
    }
  });
  return entries;
}
