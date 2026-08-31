const MINUTE_MS = 60 * 1_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export type AdventureSupportRemaining = {
  days: number;
  hours: number;
  minutes: number;
  expired: boolean;
};

export function adventureSupportRemaining(
  activeUntil: number,
  now: number,
): AdventureSupportRemaining {
  const totalMinutes =
    Number.isFinite(activeUntil) && Number.isFinite(now)
      ? Math.max(0, Math.ceil((activeUntil - now) / MINUTE_MS))
      : 0;
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor(
    (totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR,
  );
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return { days, hours, minutes, expired: totalMinutes <= 0 };
}

export function formatAdventureSupportRemaining(
  activeUntil: number,
  now: number,
): string {
  const remaining = adventureSupportRemaining(activeUntil, now);
  if (remaining.expired) return "만료됨";
  return `${remaining.days}일 ${remaining.hours}시간 ${remaining.minutes}분 남음`;
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

export function queuedStandardSupportMs(
  activeUntil: number,
  premiumUntil: number,
  now: number,
): number {
  if (
    !Number.isFinite(activeUntil) ||
    !Number.isFinite(premiumUntil) ||
    !Number.isFinite(now) ||
    premiumUntil <= now ||
    activeUntil <= premiumUntil
  ) {
    return 0;
  }
  return activeUntil - premiumUntil;
}
