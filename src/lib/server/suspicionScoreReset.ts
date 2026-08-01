export const SUSPICION_SCORE_RESET_ACTION = "suspicion-score.reset";

type ResetRow = {
  targetUserId: string | null;
  createdAt: Date;
};

type ScoredRow = {
  userId?: string | null;
  createdAt: Date;
};

export function suspicionScoreResetCutoffs(
  rows: ResetRow[],
): ReadonlyMap<string, number> {
  const cutoffs = new Map<string, number>();
  for (const row of rows) {
    if (!row.targetUserId) continue;
    const resetAt = row.createdAt.getTime();
    const previous = cutoffs.get(row.targetUserId) ?? 0;
    if (resetAt > previous) cutoffs.set(row.targetUserId, resetAt);
  }
  return cutoffs;
}

export function rowsAfterSuspicionScoreReset<T extends ScoredRow>(
  rows: T[],
  cutoffs: ReadonlyMap<string, number>,
): T[] {
  return rows.filter((row) => {
    if (!row.userId) return true;
    const resetAt = cutoffs.get(row.userId);
    return resetAt === undefined || row.createdAt.getTime() > resetAt;
  });
}
