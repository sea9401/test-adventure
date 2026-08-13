type RankingEligibilityRow = {
  bannedUntil: Date | string | null;
};

/** 정지 기간이 끝났거나 정지 이력이 없는 계정만 공개 랭킹 후보로 남긴다. */
export function filterRankingEligibleRows<T extends RankingEligibilityRow>(
  rows: readonly T[],
  now: Date = new Date(),
): T[] {
  const nowMs = now.getTime();
  return rows.filter((row) => {
    if (row.bannedUntil == null) return true;
    const bannedUntilMs = new Date(row.bannedUntil).getTime();
    return !Number.isFinite(bannedUntilMs) || bannedUntilMs <= nowMs;
  });
}
