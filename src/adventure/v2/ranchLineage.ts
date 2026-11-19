// 목장 혈통 교배 — 칸마다 가축의 혈통 등급이 있고, 그 동물의 산물과 배합 사료를 써서 교배하면
// 확률로 한 등급 오른다. 실패하면 등급은 그대로이고 그 칸의 다음 성공률이 오른다. 등급만큼 수거할 때
// 산물을 더 받고 희귀 산물이 나온다. 순수 모듈. 명장 작물(character.v2 재료) 차감은 라우트가 한다.

import { FarmError, spendFarmItems, type FarmItemId, type FarmState } from "./farm";
import {
  RANCH_ANIMAL_DEFINITIONS,
  isRanchSlotId,
  ranchSlotLineage,
  settleRanch,
  withRanchSlotLineage,
  type RanchAnimalId,
  type RanchSlotId,
} from "./ranch";
import {
  RANCH_LINEAGE_BASE_MAX_GRADE,
  RANCH_LINEAGE_BREED_FEED_COST,
  RANCH_LINEAGE_BREED_PRODUCT_COST,
  RANCH_LINEAGE_MASTER_CROP_COST,
  RANCH_LINEAGE_MASTER_GRADE,
  ranchLineageBreedChancePct,
} from "./ranchLineageRules";

export type RanchBreedCost = {
  productItemId: FarmItemId;
  products: number;
  feed: number;
  masterCrop: number;
};

export type RanchBreedContext = {
  /** 농사 주전공 명장 3단계 이상인지. */
  masterUnlocked: boolean;
  masterCropHeld: number;
};

export type RanchBreedBlockReason =
  | "slot_not_found"
  | "slot_locked"
  | "lineage_max"
  | "lineage_master_locked"
  | "not_enough_ranch_products"
  | "not_enough_feed"
  | "not_enough_master_crop";

export type RanchBreedResult = {
  slotId: RanchSlotId;
  animalId: RanchAnimalId;
  animalName: string;
  success: boolean;
  /** 교배 뒤의 혈통 등급과 연속 실패 횟수. */
  grade: number;
  fails: number;
  /** 이번 교배의 성공률(%). */
  chancePct: number;
  cost: RanchBreedCost;
};

/** 지금 등급에서 다음 등급으로 가는 교배 비용. 최고 등급이면 null. */
export function ranchBreedCost(animalId: RanchAnimalId, grade: number): RanchBreedCost | null {
  if (!Number.isInteger(grade) || grade < 0 || grade >= RANCH_LINEAGE_MASTER_GRADE) return null;
  return {
    productItemId: RANCH_ANIMAL_DEFINITIONS[animalId].outputItemId,
    products: RANCH_LINEAGE_BREED_PRODUCT_COST[animalId],
    feed: RANCH_LINEAGE_BREED_FEED_COST,
    masterCrop: grade >= RANCH_LINEAGE_BASE_MAX_GRADE ? RANCH_LINEAGE_MASTER_CROP_COST : 0,
  };
}

export function ranchBreedBlockReason(
  state: FarmState,
  slotId: RanchSlotId,
  context: RanchBreedContext,
): RanchBreedBlockReason | null {
  if (!isRanchSlotId(slotId)) return "slot_not_found";
  const slot = state.ranch.slots[slotId];
  if (!slot.unlocked || !slot.animalId) return "slot_locked";
  const lineage = ranchSlotLineage(state.ranch, slotId);
  const cost = ranchBreedCost(slot.animalId, lineage.grade);
  if (!cost) return "lineage_max";
  if (lineage.grade >= RANCH_LINEAGE_BASE_MAX_GRADE && !context.masterUnlocked) {
    return "lineage_master_locked";
  }
  if ((state.inventory[cost.productItemId] ?? 0) < cost.products) return "not_enough_ranch_products";
  if ((state.inventory.compound_feed ?? 0) < cost.feed) return "not_enough_feed";
  if (context.masterCropHeld < cost.masterCrop) return "not_enough_master_crop";
  return null;
}

/** 한 칸을 교배한다. 재료를 쓰고 확률로 한 등급 올린다. 못 하면 사유를 던진다. */
export function breedFarmRanchSlot(
  state: FarmState,
  slotId: RanchSlotId,
  context: RanchBreedContext,
  rng: () => number,
  now = Date.now(),
): { state: FarmState; result: RanchBreedResult } {
  const blocked = ranchBreedBlockReason(state, slotId, context);
  if (blocked) throw new FarmError(blocked);
  const animalId = state.ranch.slots[slotId].animalId!;
  const lineage = ranchSlotLineage(state.ranch, slotId);
  const cost = ranchBreedCost(animalId, lineage.grade)!;
  const chancePct = ranchLineageBreedChancePct(lineage);
  const success = rng() * 100 < chancePct;
  // 남겨 둔 산물 몫(yieldCarryPct)은 교배와 상관없이 그 칸에 남는다.
  const next = success
    ? { ...lineage, grade: lineage.grade + 1, fails: 0 }
    : { ...lineage, fails: lineage.fails + 1 };
  return {
    state: {
      ...state,
      inventory: spendFarmItems(state.inventory, {
        [cost.productItemId]: cost.products,
        compound_feed: cost.feed,
      }),
      // 진행 중인 생산은 건드리지 않도록 정산한 상태 위에 혈통만 바꾼다.
      ranch: withRanchSlotLineage(settleRanch(state.ranch, now), slotId, next),
    },
    result: {
      slotId,
      animalId,
      animalName: RANCH_ANIMAL_DEFINITIONS[animalId].name,
      success,
      grade: next.grade,
      fails: next.fails,
      chancePct,
      cost,
    },
  };
}
