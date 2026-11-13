import { describe, expect, it } from "vitest";
import {
  FARM_BREED_MASTER_TITLE_ID,
  FARM_BREEDER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import {
  FARM_CROP_LIST,
  FarmError,
  emptyFarmState,
  type FarmCropId,
  type FarmState,
} from "./farm";
import {
  FARM_BREEDING_TITLE_TOTAL_STAGE,
  breedFarmCrop,
  farmBreedingBlockReason,
  farmBreedingCost,
  farmBreedingEarnedTitleIds,
  farmBreedingStage,
  farmBreedingTotalStage,
  type FarmBreedingContext,
} from "./farmBreeding";

const NOW = 1_800_000_000_000;
const NO_MASTER: FarmBreedingContext = { masterUnlocked: false, masterCropHeld: 0 };

function farmWith(
  inventory: FarmState["inventory"],
  breeding?: FarmState["breeding"],
): FarmState {
  return { ...emptyFarmState(NOW), inventory, ...(breeding ? { breeding } : {}) };
}

function allCropsAt(stage: number): NonNullable<FarmState["breeding"]> {
  return Object.fromEntries(FARM_CROP_LIST.map((crop) => [crop.id, stage]));
}

describe("농장 품종 개량", () => {
  it("작물별 일반 작물 비용", () => {
    const crops = (id: FarmCropId) =>
      [1, 2, 3, 4, 5, 6].map((stage) => farmBreedingCost(id, stage)!.crops);

    expect(crops("wheat")).toEqual([40, 100, 240, 480, 800, 1200]);
    expect(crops("tomato")).toEqual([40, 100, 240, 480, 800, 1200]);
    expect(crops("cacao")).toEqual([40, 100, 240, 480, 800, 1200]);
    expect(crops("herb")).toEqual([30, 75, 180, 360, 600, 900]);
    expect(crops("strawberry")).toEqual([30, 75, 180, 360, 600, 900]);
    expect(crops("corn")).toEqual([65, 165, 390, 780, 1300, 1950]);
    expect(crops("rice")).toEqual([65, 165, 390, 780, 1300, 1950]);
    expect(crops("potato")).toEqual([55, 140, 330, 660, 1100, 1650]);
    expect(crops("soybean")).toEqual([55, 140, 330, 660, 1100, 1650]);
    expect(crops("onion")).toEqual([45, 115, 270, 540, 900, 1350]);
    expect(crops("sugarcane")).toEqual([50, 125, 300, 600, 1000, 1500]);
  });

  it("희귀 작물·명장 작물 비용과 범위 밖 단계", () => {
    expect(farmBreedingCost("wheat", 1)).toEqual({
      cropItemId: "wheat",
      crops: 40,
      rareItemId: "golden_wheat",
      rare: 2,
      masterCrop: 0,
    });
    expect(farmBreedingCost("wheat", 6)).toMatchObject({ rare: 40, masterCrop: 3 });
    expect(farmBreedingCost("wheat", 0)).toBeNull();
    expect(farmBreedingCost("wheat", 7)).toBeNull();
  });

  it("11종을 모두 5단계로 올리는 비용 합계", () => {
    let crops = 0;
    let rare = 0;
    for (const crop of FARM_CROP_LIST) {
      for (const stage of [1, 2, 3, 4, 5]) {
        const cost = farmBreedingCost(crop.id, stage)!;
        crops += cost.crops;
        rare += cost.rare;
      }
    }
    expect(FARM_CROP_LIST).toHaveLength(11);
    expect(rare).toBe(715);
    expect(crops).toBe(21_385);
  });

  it("현재 단계를 읽는다", () => {
    expect(farmBreedingStage(farmWith({}), "wheat")).toBe(0);
    expect(farmBreedingStage(farmWith({}, { wheat: 4 }), "wheat")).toBe(4);
    expect(farmBreedingStage(farmWith({}, { wheat: 42 }), "wheat")).toBe(6);
  });

  it("막힘 사유를 순서대로 판정한다", () => {
    const reason = (
      farm: FarmState,
      context: FarmBreedingContext = NO_MASTER,
    ) => farmBreedingBlockReason(farm, "wheat", context);

    expect(reason(farmWith({ wheat: 40, golden_wheat: 2 }))).toBeNull();
    expect(reason(farmWith({ wheat: 39, golden_wheat: 2 }))).toBe("not_enough_crops");
    expect(reason(farmWith({ wheat: 40, golden_wheat: 1 }))).toBe("not_enough_rare_crops");
    expect(reason(farmWith({ wheat: 0 }))).toBe("not_enough_crops");
    expect(reason(farmWith({ wheat: 9_999, golden_wheat: 99 }, { wheat: 6 }))).toBe("breeding_max");
    // 5단계·비전공이면 재료와 무관하게 명장 잠금이 먼저다.
    expect(reason(farmWith({}, { wheat: 5 }))).toBe("breeding_master_locked");
    expect(reason(farmWith({ wheat: 9_999, golden_wheat: 99 }, { wheat: 5 }))).toBe("breeding_master_locked");
    const master = { masterUnlocked: true, masterCropHeld: 2 };
    expect(reason(farmWith({ wheat: 1_199, golden_wheat: 40 }, { wheat: 5 }), master)).toBe("not_enough_crops");
    expect(reason(farmWith({ wheat: 1_200, golden_wheat: 39 }, { wheat: 5 }), master)).toBe("not_enough_rare_crops");
    expect(reason(farmWith({ wheat: 1_200, golden_wheat: 40 }, { wheat: 5 }), master)).toBe("not_enough_master_crop");
    expect(
      reason(farmWith({ wheat: 1_200, golden_wheat: 40 }, { wheat: 5 }), {
        masterUnlocked: true,
        masterCropHeld: 3,
      }),
    ).toBeNull();
  });

  it("개량하면 작물을 차감하고 단계를 올린다", () => {
    const farm = farmWith({ wheat: 45, golden_wheat: 2, herb: 7 }, { herb: 2 });
    const { state, result } = breedFarmCrop(farm, "wheat", NO_MASTER);

    expect(state.inventory).toEqual({ wheat: 5, herb: 7 });
    expect(state.breeding).toEqual({ herb: 2, wheat: 1 });
    expect(result).toEqual({
      cropId: "wheat",
      cropName: "밀",
      stage: 1,
      rareChancePct: 2,
      cost: {
        cropItemId: "wheat",
        crops: 40,
        rareItemId: "golden_wheat",
        rare: 2,
        masterCrop: 0,
      },
      grantedTitleIds: [],
    });
    // 원본은 그대로다.
    expect(farm.inventory.wheat).toBe(45);
    expect(farm.breeding).toEqual({ herb: 2 });
  });

  it("명장 품종은 13%p 가 되고 명장 작물 비용을 결과에 싣는다", () => {
    const farm = farmWith({ wheat: 1_200, golden_wheat: 40 }, { wheat: 5 });
    const { state, result } = breedFarmCrop(farm, "wheat", {
      masterUnlocked: true,
      masterCropHeld: 3,
    });

    expect(state.breeding).toEqual({ wheat: 6 });
    expect(state.inventory).toEqual({});
    expect(result.stage).toBe(6);
    expect(result.rareChancePct).toBe(13);
    expect(result.cost.masterCrop).toBe(3);
  });

  it("막히면 사유를 코드로 던지고 상태를 바꾸지 않는다", () => {
    const farm = farmWith({ wheat: 10 });
    let thrown: unknown;
    try {
      breedFarmCrop(farm, "wheat", NO_MASTER);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FarmError);
    expect((thrown as FarmError).code).toBe("not_enough_crops");
    expect(farm.inventory).toEqual({ wheat: 10 });
  });

  it("단계 합계와 칭호 조건", () => {
    expect(FARM_BREEDING_TITLE_TOTAL_STAGE).toBe(22);
    expect(farmBreedingTotalStage(farmWith({}))).toBe(0);
    expect(farmBreedingTotalStage(farmWith({}, { wheat: 3, herb: 6 }))).toBe(9);

    const twentyOne = farmWith({}, { wheat: 6, herb: 6, corn: 6, tomato: 3 });
    expect(farmBreedingTotalStage(twentyOne)).toBe(21);
    expect(farmBreedingEarnedTitleIds(twentyOne)).toEqual([]);

    const twentyTwo = farmWith({}, { wheat: 6, herb: 6, corn: 6, tomato: 4 });
    expect(farmBreedingEarnedTitleIds(twentyTwo)).toEqual([FARM_BREEDER_TITLE_ID]);

    expect(farmBreedingEarnedTitleIds(farmWith({}, allCropsAt(5)))).toEqual([
      FARM_BREEDER_TITLE_ID,
      FARM_BREED_MASTER_TITLE_ID,
    ]);
    // 합계가 커도 한 종이라도 5단계 미만이면 품종의 대가는 아니다.
    expect(
      farmBreedingEarnedTitleIds(farmWith({}, { ...allCropsAt(6), cacao: 4 })),
    ).toEqual([FARM_BREEDER_TITLE_ID]);
  });

  it("칭호 정의", () => {
    expect(TITLES[FARM_BREEDER_TITLE_ID]).toMatchObject({
      name: "육종가",
      condition: "품종 단계 합계 22 달성",
      category: "collection",
    });
    expect(TITLES[FARM_BREED_MASTER_TITLE_ID]).toMatchObject({
      name: "품종의 대가",
      condition: "모든 작물 품종 5단계 달성",
      category: "collection",
    });
  });
});
