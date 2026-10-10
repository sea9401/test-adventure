export const JOB_SP_REBALANCE_GRACE_MS = 24 * 60 * 60 * 1_000;

export type JobSpRebalanceState = {
  startedAt: number | null;
  endsAt: number | null;
  active: boolean;
};

// 해금 직업 SP: 첫 50개는 하나당 +1, 이후 두 직업당 +1. 단 7차는 달성 기간이 길어
// 체감 구간에서 빼고 하나당 +1을 그대로 더한다(7차 외 직업에만 체감식 적용).
export function jobUnlockSpForCount(
  unlockedJobCount: number,
  unlockedTier7Count = 0,
): number {
  const count = Math.max(0, Math.floor(Number(unlockedJobCount) || 0));
  const tier7 = Math.min(
    count,
    Math.max(0, Math.floor(Number(unlockedTier7Count) || 0)),
  );
  const others = count - tier7;
  return Math.min(others, 50) + Math.floor(Math.max(0, others - 50) / 2) + tier7;
}

export function jobSpRebalanceState(
  raw: unknown,
  now = Date.now(),
): JobSpRebalanceState {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).startedAt
      : undefined;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > now) {
    return { startedAt: null, endsAt: null, active: false };
  }
  const startedAt = Math.floor(parsed);
  const endsAt = startedAt + JOB_SP_REBALANCE_GRACE_MS;
  return { startedAt, endsAt, active: now < endsAt };
}
