export function environmentRefreshDelay(
  serverNow: number,
  environmentEndsAt: number,
): number {
  return Math.max(1_000, environmentEndsAt - serverNow + 1_000);
}

export function earliestEnvironmentRefreshDelay(
  serverNow: number,
  environmentEndsAt: Iterable<number>,
): number | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const endsAt of environmentEndsAt) {
    if (Number.isFinite(endsAt)) earliest = Math.min(earliest, endsAt);
  }
  return Number.isFinite(earliest)
    ? environmentRefreshDelay(serverNow, earliest)
    : null;
}
