import { describe, expect, it } from "vitest";
import {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_PROCESSING_RECIPES,
  LIFE_TOOL_UPGRADES,
  emptyLifeWorkshopState,
  lifeGatheringBonusPct,
  lifeProcessingGreatSuccessPct,
  lifeSpecializationRank,
  maxProcessBatches,
  parseLifeWorkshopState,
  rollProcessingBonusCount,
} from "./lifeWorkshop";

describe("생활 조합 가공·전문화", () => {
  it("목재·광물 원재료 12종을 가공품 6종으로 연결한다", () => {
    expect(LIFE_PROCESSING_RECIPES).toHaveLength(12);
    expect(new Set(LIFE_PROCESSING_RECIPES.map((recipe) => recipe.outputId))).toEqual(
      new Set(Object.values(LIFE_PROCESSED_MATERIAL_ID)),
    );
  });

  it("손상된 저장값을 안전한 기본 상태로 정규화한다", () => {
    expect(
      parseLifeWorkshopState({
        specializations: { woodcutting: "miner", mining: "smelter" },
        tools: { woodcutting: 99, mining: -2 },
        processing: {
          batches: -5,
          discoveredMaterialIds: [
            LIFE_PROCESSED_MATERIAL_ID.softwood,
            LIFE_PROCESSED_MATERIAL_ID.softwood,
            "invalid",
          ],
        },
      }),
    ).toMatchObject({
      specializations: { mining: "smelter" },
      tools: { woodcutting: 3, mining: 0 },
      processing: {
        batches: 0,
        discoveredMaterialIds: [LIFE_PROCESSED_MATERIAL_ID.softwood],
      },
    });
  });

  it("전문화 효과는 15·30·45레벨에 강화된다", () => {
    const state = {
      ...emptyLifeWorkshopState(),
      specializations: { woodcutting: "logger" as const, mining: "smelter" as const },
    };
    expect([1, 15, 30, 45].map(lifeSpecializationRank)).toEqual([0, 1, 2, 3]);
    expect(lifeGatheringBonusPct("woodcutting", state, 45)).toBe(10);
    expect(lifeProcessingGreatSuccessPct("mining", state, 45)).toBe(15);
    expect(lifeProcessingGreatSuccessPct("woodcutting", state, 45)).toBe(5);
  });

  it("가공 가능 횟수를 보유량과 호출 상한으로 제한한다", () => {
    const recipe = LIFE_PROCESSING_RECIPES[0];
    expect(maxProcessBatches({ [recipe.inputId]: 29 }, recipe)).toBe(2);
    expect(maxProcessBatches({ [recipe.inputId]: 99_999 }, recipe)).toBe(100);
  });

  it("가공 대성공을 묶음별로 독립 판정한다", () => {
    const rolls = [0.01, 0.2, 0.04, 0.9];
    expect(rollProcessingBonusCount(4, 5, () => rolls.shift() ?? 1)).toBe(2);
  });

  it("두 생활 도구 모두 10·25·40레벨에 세 단계로 승급한다", () => {
    for (const upgrades of Object.values(LIFE_TOOL_UPGRADES)) {
      expect(upgrades.map((upgrade) => upgrade.requiredLevel)).toEqual([10, 25, 40]);
      expect(upgrades.every((upgrade) => Object.keys(upgrade.materials).length === 3)).toBe(true);
    }
  });
});
