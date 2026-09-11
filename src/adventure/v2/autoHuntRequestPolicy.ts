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
  // 일반 자동 사냥은 선택 횟수를 유지하고, 반복 간격은 횟수에 비례해 늘리지 않는다.
  return {
    count: coreLoopOn || rareMap ? 1 : selectedCount,
    intervalMs: AUTO_HUNT_BATTLE_CADENCE_MS,
  };
}
