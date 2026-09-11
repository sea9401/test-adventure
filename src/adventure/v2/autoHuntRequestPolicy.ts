import type { HuntCount } from "@/adventure/data/v2/adventureSupport";

export const AUTO_HUNT_BATTLE_CADENCE_MS = 1_500;

export function autoHuntRequestPlan({
  selectedCount: _selectedCount,
  coreLoopOn: _coreLoopOn,
  rareMap: _rareMap,
}: {
  selectedCount: HuntCount;
  coreLoopOn: boolean;
  rareMap: boolean;
}): { count: HuntCount; intervalMs: number } {
  // 수동 일괄 사냥의 선택 횟수와 분리해 자동 사냥은 한 판씩 같은 속도로 진행한다.
  return { count: 1, intervalMs: AUTO_HUNT_BATTLE_CADENCE_MS };
}
