import { describe, expect, it } from "vitest";
import { emptyFarmState, type FarmState } from "./farm";
import {
  FARM_ENDGAME_SHOP_ITEMS,
  farmEndgameShopProgress,
  farmEndgameShopView,
} from "./farmEndgameShop";

function completedFarm(): FarmState {
  const farm = emptyFarmState(1_000);
  return {
    ...farm,
    plots: Array.from({ length: 6 }, (_, index) => ({
      id: `plot-${index + 1}`,
      cropId: null,
      plantedAt: null,
      readyAt: null,
    })),
    ranch: {
      ...farm.ranch,
      pens: Object.fromEntries(
        Object.entries(farm.ranch.pens).map(([id, pen]) => [id, { ...pen, unlocked: true }]),
      ) as FarmState["ranch"]["pens"],
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

  it("밭 6칸과 유료 축사 4칸을 모두 열어야 해금한다", () => {
    expect(farmEndgameShopProgress(emptyFarmState(1_000))).toEqual({
      unlocked: false,
      plots: 2,
      requiredPlots: 6,
      pens: 0,
      requiredPens: 4,
    });
    expect(farmEndgameShopProgress(completedFarm()).unlocked).toBe(true);
  });

  it("교환소 칭호만 보유 목록에 포함한다", () => {
    expect(
      farmEndgameShopView(completedFarm(), ["first_blood", "farm_bountiful_hand"])
        .ownedTitleIds,
    ).toEqual(["farm_bountiful_hand"]);
  });
});
