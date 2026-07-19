const DAY_MS = 24 * 60 * 60 * 1_000;

export function adventureSupportRemainingDays(
  activeUntil: number,
  now: number,
): number {
  if (!Number.isFinite(activeUntil) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((activeUntil - now) / DAY_MS));
}

export function formatAdventureSupportExpiry(activeUntil: number): string {
  if (!Number.isFinite(activeUntil) || activeUntil <= 0) return "만료 일시 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(activeUntil));
}
