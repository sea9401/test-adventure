// 농장 품종 개량 — 작물마다 일반·희귀 작물을 써서 품종 단계를 올리고, 단계만큼 그 작물의 희귀 수확 확률이 오른다.
// 순수 모듈. 명장 작물(character.v2 재료) 차감과 칭호 지급은 라우트가 한다.

import {
  FARM_BREED_MASTER_TITLE_ID,
  FARM_BREEDER_TITLE_ID,
} from "@/adventure/data/titles";
import {
  FARM_CROPS,
  FARM_CROP_LIST,
  FarmError,
  spendFarmItems,
  type FarmCropId,
  type FarmItemId,
  type FarmState,
} from "./farm";
import {
  FARM_BREEDING_BASE_MAX_STAGE,
  FARM_BREEDING_STAGE_COSTS,
  farmBreedingRareChancePct,
  normalizeFarmBreedingStage,
} from "./farmBreedingRules";

export {
  FARM_BREEDING_BASE_MAX_STAGE,
  FARM_BREEDING_MASTER_STAGE,
  FARM_BREEDING_STAGE_COSTS,
  farmBreedingRareChancePct,
} from "./farmBreedingRules";

/** 칭호 ‘육종가’를 받는 품종 단계 합계. */
export const FARM_BREEDING_TITLE_TOTAL_STAGE = 22;
/** 일반 작물 비용을 맞추는 단위. */
const CROP_COST_STEP = 5;

export type FarmBreedingCost = {
  cropItemId: FarmItemId;
  crops: number;
  rareItemId: FarmItemId;
  rare: number;
  masterCrop: number;
};

export type FarmBreedingContext = {
  /** 농사 주전공 명장 3단계 이상인지. */
  masterUnlocked: boolean;
  masterCropHeld: number;
};

export type FarmBreedingBlockReason =
  | "breeding_max"
  | "breeding_master_locked"
  | "not_enough_crops"
  | "not_enough_rare_crops"
  | "not_enough_master_crop";

export type FarmBreedingResult = {
  cropId: FarmCropId;
  cropName: string;
  stage: number;
  rareChancePct: number;
  cost: FarmBreedingCost;
  grantedTitleIds: string[];
};

export function farmBreedingStage(state: FarmState, cropId: FarmCropId): number {
  return normalizeFarmBreedingStage(state.breeding?.[cropId] ?? 0);
}

/** 목표 단계로 올리는 비용. 1~6 밖이면 null. */
export function farmBreedingCost(
  cropId: FarmCropId,
  targetStage: number,
): FarmBreedingCost | null {
  const stageCost = Number.isInteger(targetStage)
    ? FARM_BREEDING_STAGE_COSTS[targetStage - 1]
    : undefined;
  if (!stageCost) return null;
  const crop = FARM_CROPS[cropId];
  const averageYield = (crop.yieldMin + crop.yieldMax) / 2;
  return {
    cropItemId: crop.itemId,
    crops:
      Math.round((stageCost.harvests * averageYield) / CROP_COST_STEP) *
      CROP_COST_STEP,
    rareItemId: crop.rareItemId,
    rare: stageCost.rare,
    masterCrop: stageCost.masterCrop,
  };
}

export function farmBreedingBlockReason(
  state: FarmState,
  cropId: FarmCropId,
  context: FarmBreedingContext,
): FarmBreedingBlockReason | null {
  const stage = farmBreedingStage(state, cropId);
  const cost = farmBreedingCost(cropId, stage + 1);
  if (!cost) return "breeding_max";
  if (stage >= FARM_BREEDING_BASE_MAX_STAGE && !context.masterUnlocked) {
    return "breeding_master_locked";
  }
  if ((state.inventory[cost.cropItemId] ?? 0) < cost.crops) {
    return "not_enough_crops";
  }
  if ((state.inventory[cost.rareItemId] ?? 0) < cost.rare) {
    return "not_enough_rare_crops";
  }
  if (context.masterCropHeld < cost.masterCrop) return "not_enough_master_crop";
  return null;
}

export function breedFarmCrop(
  state: FarmState,
  cropId: FarmCropId,
  context: FarmBreedingContext,
): { state: FarmState; result: FarmBreedingResult } {
  const blocked = farmBreedingBlockReason(state, cropId, context);
  if (blocked) throw new FarmError(blocked);
  const stage = farmBreedingStage(state, cropId) + 1;
  const cost = farmBreedingCost(cropId, stage)!;
  return {
    state: {
      ...state,
      inventory: spendFarmItems(state.inventory, {
        [cost.cropItemId]: cost.crops,
        [cost.rareItemId]: cost.rare,
      }),
      breeding: { ...state.breeding, [cropId]: stage },
    },
    result: {
      cropId,
      cropName: FARM_CROPS[cropId].name,
      stage,
      rareChancePct: farmBreedingRareChancePct(stage),
      cost,
      grantedTitleIds: [],
    },
  };
}

export function farmBreedingTotalStage(state: FarmState): number {
  return FARM_CROP_LIST.reduce(
    (total, crop) => total + farmBreedingStage(state, crop.id),
    0,
  );
}

/** 지금 품종 단계로 조건을 채운 칭호. 지급 여부는 라우트가 보유 칭호와 견줘 정한다. */
export function farmBreedingEarnedTitleIds(state: FarmState): string[] {
  const titleIds: string[] = [];
  if (farmBreedingTotalStage(state) >= FARM_BREEDING_TITLE_TOTAL_STAGE) {
    titleIds.push(FARM_BREEDER_TITLE_ID);
  }
  if (
    FARM_CROP_LIST.every(
      (crop) => farmBreedingStage(state, crop.id) >= FARM_BREEDING_BASE_MAX_STAGE,
    )
  ) {
    titleIds.push(FARM_BREED_MASTER_TITLE_ID);
  }
  return titleIds;
}
