export function coopListPollDelayMs(unchanged: number): number {
  return unchanged >= 2 ? 60_000 : 20_000;
}

export function coopDetailPollDelayMs(unchanged: number): number {
  if (unchanged >= 8) return 30_000;
  if (unchanged >= 3) return 15_000;
  return 5_000;
}

export function guildRaidPollDelayMs(unchanged: number): number {
  return unchanged >= 2 ? 60_000 : 20_000;
}

export function guildTradePollDelayMs(unchanged: number): number {
  if (unchanged >= 5) return 60_000;
  if (unchanged >= 2) return 30_000;
  return 10_000;
}

export function tournamentPollDelayMs(unchanged: number): number {
  if (unchanged >= 6) return 60_000;
  if (unchanged >= 2) return 30_000;
  return 15_000;
}

export function sharedStateSnapshotKey(value: unknown): string {
  return JSON.stringify(value);
}
