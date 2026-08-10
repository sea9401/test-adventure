export function environmentRefreshDelay(
  serverNow: number,
  environmentEndsAt: number,
): number {
  return Math.max(1_000, environmentEndsAt - serverNow + 1_000);
}
