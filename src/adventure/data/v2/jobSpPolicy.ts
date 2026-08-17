export const JOB_SP_REBALANCE_GRACE_MS = 24 * 60 * 60 * 1_000;

export type JobSpRebalanceState = {
  startedAt: number | null;
  endsAt: number | null;
  active: boolean;
};

export function jobUnlockSpForCount(unlockedJobCount: number): number {
  const count = Math.max(0, Math.floor(Number(unlockedJobCount) || 0));
  return Math.min(count, 50) + Math.floor(Math.max(0, count - 50) / 2);
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
