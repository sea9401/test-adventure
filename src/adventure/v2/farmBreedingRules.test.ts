import { describe, expect, it } from "vitest";
import {
  FARM_BREEDING_BASE_MAX_STAGE,
  FARM_BREEDING_MASTER_STAGE,
  FARM_BREEDING_STAGE_COSTS,
  farmBreedingRareChancePct,
  normalizeFarmBreedingStage,
} from "./farmBreedingRules";

describe("농장 품종 개량 규칙", () => {
  it("단계 상한", () => {
    expect(FARM_BREEDING_BASE_MAX_STAGE).toBe(5);
    expect(FARM_BREEDING_MASTER_STAGE).toBe(6);
  });

  it("단계별 희귀 수확 보너스", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(farmBreedingRareChancePct)).toEqual([
      0, 2, 4, 6, 8, 10, 13,
    ]);
  });

  it("범위 밖 단계를 정리한다", () => {
    expect(normalizeFarmBreedingStage(-1)).toBe(0);
    expect(normalizeFarmBreedingStage(2.9)).toBe(2);
    expect(normalizeFarmBreedingStage(9)).toBe(6);
    expect(normalizeFarmBreedingStage("3")).toBe(0);
    expect(normalizeFarmBreedingStage(Number.NaN)).toBe(0);
    expect(farmBreedingRareChancePct(99)).toBe(13);
    expect(farmBreedingRareChancePct(-4)).toBe(0);
  });

  it("단계별 비용 표", () => {
    expect(FARM_BREEDING_STAGE_COSTS).toEqual([
      { harvests: 10, rare: 2, masterCrop: 0 },
      { harvests: 25, rare: 5, masterCrop: 0 },
      { harvests: 60, rare: 10, masterCrop: 0 },
      { harvests: 120, rare: 18, masterCrop: 0 },
      { harvests: 200, rare: 30, masterCrop: 0 },
      { harvests: 300, rare: 40, masterCrop: 3 },
    ]);
  });
});
