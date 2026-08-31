import { describe, expect, it } from "vitest";
import { emptyFarmState, type FarmState } from "./farm";
import {
  FARM_ENDGAME_SHOP_REQUIRED_PLOTS,
  FARM_ENDGAME_SHOP_ITEMS,
  farmEndgameShopProgress,
  farmEndgameShopView,
} from "./farmEndgameShop";

function completedFarm(): FarmState {
  const farm = emptyFarmState(1_000);
  return {
    ...farm,
    plots: Array.from({ length: 8 }, (_, index) => ({
      id: `plot-${index + 1}`,
      cropId: null,
      plantedAt: null,
      readyAt: null,
    })),
    ranch: {
      ...farm.ranch,
      slots: Object.fromEntries(
        Object.entries(farm.ranch.slots).map(([id, slot], index) => [
          id,
          index < 5
            ? {
                ...slot,
                unlocked: true,
                animalId: (["chicken", "cow", "pig"] as const)[index % 3],
              }
            : slot,
        ]),
      ) as FarmState["ranch"]["slots"],
    },
  };
}

describe("농장주의 교환소", () => {
  it("승인된 상품과 가격을 정의한다", () => {
    expect(FARM_ENDGAME_SHOP_ITEMS).toMatchObject([
      {
        id: "ranch-feed-bundle",
        costReputation: 20,
        reward: { kind: "farmItem", itemId: "compound_feed", quantity: 5 },
      },
      {
        id: "fertilizer-bundle",
        costReputation: 24,
        reward: { kind: "finishedItem", itemId: "organic_fertilizer", quantity: 3 },
      },
      {
        id: "title-bountiful-hand",
        costReputation: 1_000,
        reward: { kind: "title", titleId: "farm_bountiful_hand" },
      },
      {
        id: "title-golden-fields-owner",
        costReputation: 5_000,
        reward: { kind: "title", titleId: "farm_golden_fields_owner" },
      },
    ]);
  });

  it("밭 8칸과 유료 축사 4칸을 모두 열어야 해금한다", () => {
    expect(FARM_ENDGAME_SHOP_REQUIRED_PLOTS).toBe(8);
    expect(farmEndgameShopProgress(emptyFarmState(1_000))).toEqual({
      unlocked: false,
      plots: 2,
      requiredPlots: 8,
      pens: 0,
      requiredPens: 4,
    });
    expect(
      farmEndgameShopProgress({
        ...completedFarm(),
        plots: completedFarm().plots.slice(0, 7),
      }).unlocked,
    ).toBe(false);
    expect(farmEndgameShopProgress(completedFarm())).toMatchObject({
      unlocked: true,
      plots: 8,
      requiredPlots: 8,
      pens: 4,
      requiredPens: 4,
    });
  });

  it("6번 이후 부지와 축사 종류는 기존 유료 축사 4/4 진행도에 영향을 주지 않는다", () => {
    const farm = completedFarm();
    const changed = {
      ...farm,
      ranch: {
        ...farm.ranch,
        slots: {
          ...farm.ranch.slots,
          "slot-1": { ...farm.ranch.slots["slot-1"], animalId: "pig" as const },
          "slot-6": {
            ...farm.ranch.slots["slot-6"],
            unlocked: true,
            animalId: "cow" as const,
          },
        },
      },
    };

    expect(farmEndgameShopProgress(changed)).toMatchObject({
      unlocked: true,
      pens: 4,
      requiredPens: 4,
    });
  });

  it("1번을 포함한 부지 1~5가 모두 열려 있어야 한다", () => {
    const farm = completedFarm();
    const missingStarter = {
      ...farm,
      ranch: {
        ...farm.ranch,
        slots: {
          ...farm.ranch.slots,
          "slot-1": { ...farm.ranch.slots["slot-1"], unlocked: false },
        },
      },
    };

    expect(farmEndgameShopProgress(missingStarter)).toMatchObject({
      unlocked: false,
      pens: 4,
    });
  });

  it("교환소 칭호만 보유 목록에 포함한다", () => {
    expect(
      farmEndgameShopView(completedFarm(), ["first_blood", "farm_bountiful_hand"])
        .ownedTitleIds,
    ).toEqual(["farm_bountiful_hand"]);
  });
});
