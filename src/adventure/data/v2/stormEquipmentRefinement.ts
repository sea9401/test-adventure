import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2Equipment,
  type V2EquipRoll,
} from "./v2Equipment";
import { VARIANCE_FRACTION } from "./v2EquipVariance";
import {
  STORM_EXPEDITION_ROUTE_MATERIAL_ID,
  STORM_HEART_FRAGMENT_MATERIAL_ID,
} from "./stormExpeditionRewards";

/** 특화 단품을 버리지 않고 6T 조합의 1+1 자리에 남기는 확정 개량. */
export const STORM_REFINEMENT_GOLD_COST = 1_000_000;
export const STORM_REFINEMENT_ROUTE_MATERIAL_COST = 6;
export const STORM_REFINEMENT_HEART_COST = 1;

export const STORM_REFINEMENT_MATERIAL_COST: Readonly<Record<string, number>> = {
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.wreckage]:
    STORM_REFINEMENT_ROUTE_MATERIAL_COST,
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.gale]: STORM_REFINEMENT_ROUTE_MATERIAL_COST,
  [STORM_EXPEDITION_ROUTE_MATERIAL_ID.thunder]:
    STORM_REFINEMENT_ROUTE_MATERIAL_COST,
  [STORM_HEART_FRAGMENT_MATERIAL_ID]: STORM_REFINEMENT_HEART_COST,
};

/** 앞서 추가된 4~5T 특화 유니크. 일반 장비나 완성된 6T 세트는 대상이 아니다. */
export function isStormRefinementCandidate(item: V2Equipment): boolean {
  return item.rarity === "unique" && item.tier >= 7 && item.tier <= 12;
}

export function canStormRefine(
  item: V2Equipment,
  instance: Pick<V2EquipInstance, "stormRefined">,
): boolean {
  return (
    isStormRefinementCandidate(item) &&
    instance.stormRefined !== true &&
    stormRefinementTargetBasePower(item) > item.power
  );
}

function powerRange(basePower: number): { lo: number; hi: number } {
  const spread = Math.round(basePower * VARIANCE_FRACTION);
  return {
    lo: Math.max(1, basePower - spread),
    hi: basePower + spread,
  };
}

function powerQuality(item: V2Equipment, roll: V2EquipRoll | undefined): number {
  if (!roll) return 0.5;
  const basePower = roll.powerBase ?? item.power;
  const range = powerRange(basePower);
  if (range.hi <= range.lo) return 0.5;
  return Math.max(0, Math.min(1, (roll.power - range.lo) / (range.hi - range.lo)));
}

/** 같은 부위(무기는 같은 무기군)의 6T 세트 장비 중앙값을 개량 기준선으로 사용한다. */
export function stormRefinementTargetBasePower(item: V2Equipment): number {
  const candidates = Object.values(V2_EQUIPMENT)
    .filter(
      (candidate) =>
        candidate.tier === 16 &&
        candidate.slot === item.slot &&
        (item.slot !== "weapon" || candidate.weaponType === item.weaponType),
    )
    .map((candidate) => candidate.power)
    .sort((a, b) => a - b);
  if (candidates.length === 0) return item.power;
  const middle = Math.floor(candidates.length / 2);
  const tier6Median = candidates.length % 2 === 1
    ? candidates[middle]
    : Math.round((candidates[middle - 1] + candidates[middle]) / 2);
  // 이미 6T 중앙값보다 강한 최후반 특화 장비를 개량하면서 되레 낮추지 않는다.
  return Math.max(item.power, tier6Median);
}

/** 옵션 굴림은 그대로 두고 위력 굴림의 상대 위치만 새 6T 밴드에 옮긴다. */
export function stormRefinedRoll(
  item: V2Equipment,
  instance: Pick<V2EquipInstance, "roll">,
): V2EquipRoll {
  const targetBase = stormRefinementTargetBasePower(item);
  const targetRange = powerRange(targetBase);
  const quality = powerQuality(item, instance.roll);
  return {
    power:
      targetRange.lo +
      Math.round(quality * Math.max(0, targetRange.hi - targetRange.lo)),
    weight: instance.roll?.weight ?? 0,
    ...(instance.roll?.options
      ? { options: { ...instance.roll.options } }
      : item.options
        ? { options: { ...item.options } }
        : {}),
    powerBase: targetBase,
  };
}

export function stormRefinementPreview(
  item: V2Equipment,
  instance: Pick<V2EquipInstance, "roll">,
): { currentPower: number; refinedPower: number; targetBasePower: number } {
  return {
    currentPower: instance.roll?.power ?? item.power,
    refinedPower: stormRefinedRoll(item, instance).power,
    targetBasePower: stormRefinementTargetBasePower(item),
  };
}
