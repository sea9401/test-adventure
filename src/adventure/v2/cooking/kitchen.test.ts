import { describe, expect, it } from "vitest";
import {
  COOKING_PANTRY_ITEMS,
  COOKING_PROCESSING_RECIPES,
  buyCookingPantryItem,
  processCookingIngredient,
} from "./kitchen";

describe("cooking kitchen supplies", () => {
  it("여섯 상점 재료와 여섯 가공 재료를 제공한다", () => {
    expect(COOKING_PANTRY_ITEMS).toHaveLength(6);
    expect(COOKING_PROCESSING_RECIPES).toHaveLength(6);
    expect(new Set(COOKING_PROCESSING_RECIPES.map((entry) => entry.outputId)).size).toBe(6);
  });

  it("상점 재료를 수량만큼 구매한다", () => {
    expect(buyCookingPantryItem({ gold: 1_000, kitchenItems: {} }, "pantry:salt", 3)).toEqual({
      gold: 850,
      kitchenItems: { "pantry:salt": 3 },
    });
    expect(() =>
      buyCookingPantryItem({ gold: 100, kitchenItems: {} }, "pantry:spice", 2),
    ).toThrow("not_enough_gold");
  });

  it("농장 재료를 차감해 가공 재료를 만든다", () => {
    const result = processCookingIngredient(
      { farmItems: { wheat: 10 }, kitchenItems: {} },
      "processed:flour",
      2,
    );
    expect(result).toEqual({
      farmItems: { wheat: 4 },
      kitchenItems: { "processed:flour": 2 },
    });
    expect(() =>
      processCookingIngredient(
        { farmItems: { wheat: 5 }, kitchenItems: {} },
        "processed:flour",
        2,
      ),
    ).toThrow("not_enough_farm_items");
  });
});
