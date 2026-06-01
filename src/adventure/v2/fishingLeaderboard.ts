// 낚시 주간 리더보드 — 순수 셰이핑 + 공용 타입. 서버(쿼리 결과 가공)·클라(뷰)·dev(mock) 공용.
//
// 설계: docs/fishing-content-plan.md §5

export type LeaderboardRow = {
  fishId: string;
  userId: string;
  name: string | null;
  size: number;
};

export type LeaderboardEntry = {
  rank: number;
  name: string;
  size: number;
  isMe: boolean;
};

export type FishingLeaderboardData = {
  seasonId: string;
  endsAt: string; // ISO
  // 내 낚시 코인 잔액(주간 정산으로 적립).
  myCoins: number;
  // fishId -> 순위 오름차순 엔트리. top-N + (top 밖이면) 본인 행만.
  byFish: Record<string, LeaderboardEntry[]>;
};

// rows 는 종별로 사이즈 내림차순 정렬돼 들어온다고 가정(쿼리가 ORDER BY fish_id, best_size DESC).
// 종별 위치 기반 rank 부여 후 top-N 또는 본인 행만 남긴다. 사이즈가 연속값이라 동률은 드물어
// 위치 순(연속 rank)로 충분 — 정밀 동률 처리는 정산(PR-5)에서 다룬다.
export function shapeLeaderboard(
  rows: LeaderboardRow[],
  meUserId: string,
  topN: number = 10,
): Record<string, LeaderboardEntry[]> {
  const groups = new Map<string, LeaderboardRow[]>();
  for (const r of rows) {
    const g = groups.get(r.fishId);
    if (g) g.push(r);
    else groups.set(r.fishId, [r]);
  }
  const byFish: Record<string, LeaderboardEntry[]> = {};
  for (const [fishId, list] of groups) {
    const entries: LeaderboardEntry[] = [];
    // 표준 경쟁 순위(1224) — 정산(computeSeasonPayouts)과 동일하게 동률은 같은 순위.
    let rank = 0;
    let prevSize = Number.POSITIVE_INFINITY;
    list.forEach((r, i) => {
      if (r.size < prevSize) {
        rank = i + 1;
        prevSize = r.size;
      }
      const isMe = r.userId === meUserId;
      if (rank <= topN || isMe) {
        entries.push({
          rank,
          name: (r.name ?? "").trim() || "모험가",
          size: r.size,
          isMe,
        });
      }
    });
    byFish[fishId] = entries;
  }
  return byFish;
}
