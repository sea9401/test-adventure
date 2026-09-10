import type { Listing } from "./marketplaceShared";

export function marketplacePollDelayMs(consecutiveUnchangedPolls: number): number {
  if (consecutiveUnchangedPolls >= 5) return 60_000;
  if (consecutiveUnchangedPolls >= 2) return 30_000;
  return 10_000;
}

export function marketplaceBrowseSnapshotKey(
  mineOnly: boolean,
  viewerGold: number | null,
  listings: readonly Listing[],
): string {
  return JSON.stringify([mineOnly, viewerGold, listings]);
}
