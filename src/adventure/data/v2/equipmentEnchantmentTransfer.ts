import type { LiberationLineCount, LiberationRank } from "./equipmentLiberation";
import type { V2EquipInstance } from "./v2Equipment";

const BASE_COST: Record<LiberationRank, number> = {
  3: 15_000_000,
  2: 30_000_000,
  1: 50_000_000,
};

export function enchantmentTransferCost(state: {
  rank: LiberationRank;
  lineCount: LiberationLineCount;
}): { baseGoldCost: number; additionalGoldCost: number; goldCost: number } {
  const baseGoldCost = BASE_COST[state.rank];
  const additionalGoldCost = baseGoldCost * (state.lineCount - 1) / 2;
  return { baseGoldCost, additionalGoldCost, goldCost: baseGoldCost + additionalGoldCost };
}

/** 이전으로 옵션이 없어져도 변경 번호를 유지해 과거 확인 요청의 재사용을 막는다. */
export function equipmentLiberationRevision(instance: V2EquipInstance): number {
  return Math.max(instance.liberationRevision ?? 0, instance.liberation?.revision ?? 0);
}
