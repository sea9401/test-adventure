import { describe, expect, it } from "vitest";

import {
  cookingPost50Bonuses,
  farmingPost50Bonuses,
  fishingPost50Bonuses,
  miningPost50Bonuses,
  woodcuttingPost50Bonuses,
} from "./lifeLevelBonuses";

describe("생활 레벨 51~100 직종별 보너스", () => {
  it("50레벨 이하는 기존 효과에 아무 값도 더하지 않는다", () => {
    expect(farmingPost50Bonuses(50)).toEqual({
      yieldBonusPct: 0,
      rareChancePct: 0,
    });
    expect(woodcuttingPost50Bonuses(50)).toEqual({
      bonusLogChancePct: 0,
      seedChancePct: 0,
      rareResultChancePct: 0,
    });
    expect(miningPost50Bonuses(50)).toEqual({
      bonusOreChancePct: 0,
      byproductChancePct: 0,
      rareByproductChancePct: 0,
    });
    expect(fishingPost50Bonuses(50)).toEqual({
      sizeBonusPct: 0,
      specialWeightPct: 0,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
    });
    expect(cookingPost50Bonuses(50)).toEqual({
      masterpieceChancePct: 0,
      materialReductionPct: 0,
      rareIngredientSaveChancePct: 0,
    });
  });

  it("농사 연속 수확량과 희귀 마일스톤을 적용한다", () => {
    expect(farmingPost50Bonuses(51)).toEqual({
      yieldBonusPct: 0.1,
      rareChancePct: 0,
    });
    expect(farmingPost50Bonuses(60).rareChancePct).toBe(0.25);
    expect(farmingPost50Bonuses(75).rareChancePct).toBe(0.5);
    expect(farmingPost50Bonuses(90).rareChancePct).toBe(0.75);
    expect(farmingPost50Bonuses(100)).toEqual({
      yieldBonusPct: 5,
      rareChancePct: 1,
    });
  });

  it("벌목과 채광의 주 보너스 및 60·90 마일스톤을 적용한다", () => {
    expect(woodcuttingPost50Bonuses(100)).toEqual({
      bonusLogChancePct: 5,
      seedChancePct: 0.5,
      rareResultChancePct: 1,
    });
    expect(miningPost50Bonuses(100)).toEqual({
      bonusOreChancePct: 5,
      byproductChancePct: 0.5,
      rareByproductChancePct: 1,
    });
    expect(woodcuttingPost50Bonuses(59).seedChancePct).toBe(0);
    expect(woodcuttingPost50Bonuses(60).seedChancePct).toBe(0.5);
    expect(miningPost50Bonuses(89).rareByproductChancePct).toBe(0);
    expect(miningPost50Bonuses(90).rareByproductChancePct).toBe(1);
  });

  it("낚시는 두 구간 선형 보정과 90·100 마일스톤을 적용한다", () => {
    expect(fishingPost50Bonuses(60)).toEqual({
      sizeBonusPct: 1,
      specialWeightPct: 1.2,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
    });
    expect(fishingPost50Bonuses(75)).toEqual({
      sizeBonusPct: 1.75,
      specialWeightPct: 3,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
    });
    expect(fishingPost50Bonuses(100)).toEqual({
      sizeBonusPct: 3,
      specialWeightPct: 5,
      rareSizeBonusPct: 1,
      bigCatchSizeBonusPct: 1,
    });
  });

  it("요리는 걸작 확률과 75·90 재료 절약 마일스톤을 적용한다", () => {
    expect(cookingPost50Bonuses(74)).toEqual({
      masterpieceChancePct: 2.4,
      materialReductionPct: 0,
      rareIngredientSaveChancePct: 0,
    });
    expect(cookingPost50Bonuses(75).materialReductionPct).toBe(2);
    expect(cookingPost50Bonuses(90).rareIngredientSaveChancePct).toBe(2);
    expect(cookingPost50Bonuses(100)).toEqual({
      masterpieceChancePct: 5,
      materialReductionPct: 2,
      rareIngredientSaveChancePct: 2,
    });
  });
});
