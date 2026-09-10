import type { HuntCount } from "@/adventure/data/v2/adventureSupport";

export const AUTO_HUNT_BATTLE_CADENCE_MS = 1_500;

export function autoHuntRequestPlan({
  selectedCount,
  coreLoopOn,
  rareMap,
}: {
  selectedCount: HuntCount;
  coreLoopOn: boolean;
  rareMap: boolean;
}): { count: HuntCount; intervalMs: number } {
  if (coreLoopOn || rareMap) {
    return { count: 1, intervalMs: AUTO_HUNT_BATTLE_CADENCE_MS };
  }
  const count = selectedCount === 1 ? 5 : selectedCount;
  return {
    count,
    intervalMs: AUTO_HUNT_BATTLE_CADENCE_MS * count,
  };
}
