// 농장 품종 개량 규칙 상수 — farm.ts 의 수확 판정과 farmBreeding.ts 의 개량 로직이 함께 읽는다.
//   farmBreeding.ts 가 farm.ts 의 작물 정의를 읽으므로, farm.ts 가 필요한 값은 의존성 없는 이 파일에 둔다.

/** 누구나 올릴 수 있는 마지막 단계. */
export const FARM_BREEDING_BASE_MAX_STAGE = 5;
/** 명장 품종 — 농사 주전공 명장 3단계 이상만 올릴 수 있다. */
export const FARM_BREEDING_MASTER_STAGE = 6;

const BASE_RARE_CHANCE_PCT_PER_STAGE = 2;
const MASTER_RARE_CHANCE_PCT = 13;

export type FarmBreedingStageCost = {
  /** 일반 작물 비용. 그 작물의 기본 평균 수확량을 곱해 개수로 바꾼다. */
  harvests: number;
  rare: number;
  masterCrop: number;
};

/** 인덱스 = 목표 단계 − 1. */
export const FARM_BREEDING_STAGE_COSTS: readonly FarmBreedingStageCost[] = [
  { harvests: 10, rare: 2, masterCrop: 0 },
  { harvests: 25, rare: 5, masterCrop: 0 },
  { harvests: 60, rare: 10, masterCrop: 0 },
  { harvests: 120, rare: 18, masterCrop: 0 },
  { harvests: 200, rare: 30, masterCrop: 0 },
  { harvests: 300, rare: 40, masterCrop: 3 },
];

export function normalizeFarmBreedingStage(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(FARM_BREEDING_MASTER_STAGE, Math.floor(raw)));
}

/** 품종 단계가 그 작물의 희귀 수확 확률에 더하는 값(%p). */
export function farmBreedingRareChancePct(stage: number): number {
  const safeStage = normalizeFarmBreedingStage(stage);
  return safeStage >= FARM_BREEDING_MASTER_STAGE
    ? MASTER_RARE_CHANCE_PCT
    : safeStage * BASE_RARE_CHANCE_PCT_PER_STAGE;
}
