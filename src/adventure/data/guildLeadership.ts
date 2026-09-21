export const GUILD_LEADERSHIP_INACTIVE_DAYS = 3;
const INACTIVE_MS = GUILD_LEADERSHIP_INACTIVE_DAYS * 24 * 60 * 60 * 1000;

/** 기록 누락은 미접속의 증거가 아니므로 승계를 허용하지 않는다. */
export function canClaimGuildLeadership(
  lastSeenAt: Date | null | undefined,
  now: number,
): boolean {
  return lastSeenAt != null && now - lastSeenAt.getTime() >= INACTIVE_MS;
}
