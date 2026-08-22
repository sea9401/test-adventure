import { describe, expect, it } from "vitest";

import { emptyCookingState, cookingLevelXpThreshold } from "@/adventure/v2/cooking/state";
import type { CookingIngredientId } from "@/adventure/v2/cooking/types";
import { COOKING_SECRET_RECIPE_BY_ID, findSecretRecipe } from "./recipes";
import {
  cookingCombinationHash,
  resolveCookingResearch,
  researchSlotLimitForLevel,
} from "./research";

const NOW = new Date("2026-08-22T02:00:00.000Z").getTime();

function balancesFor(ids: readonly CookingIngredientId[], count = 5) {
  const farm: Record<string, number> = {};
  const fishing: Record<string, number> = {};
  const kitchen: Record<string, number> = {};
  for (const id of ids) {
    const [kind, itemId] = id.split(":");
    if (kind === "farm") farm[itemId] = count;
    else if (kind === "fishing") fishing[itemId] = count;
    else kitchen[id] = count;
  }
  return { farm, fishing, kitchen };
}

describe("cooking research", () => {
  it("알 수 없는 조리법을 거부한다", () => {
    expect(() => resolveCookingResearch({
      state: { ...emptyCookingState(NOW), xp: cookingLevelXpThreshold(50) },
      method: "smoke" as never,
      ingredientIds: ["farm:wheat", "farm:milk"],
      balances: balancesFor(["farm:wheat", "farm:milk"]),
      failedBefore: false,
    })).toThrow("invalid_method");
  });
  it("consumes one of each selected ingredient and discovers the exact unordered answer", () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("tomato_salad")!;
    const ingredientIds = recipe.ingredients.map((entry) => entry.id).reverse();
    const state = {
      ...emptyCookingState(NOW),
      xp: cookingLevelXpThreshold(10),
    };

    const result = resolveCookingResearch({
      state,
      method: recipe.method,
      ingredientIds,
      balances: balancesFor(ingredientIds),
      failedBefore: false,
    });

    expect(result.kind).toBe("success");
    expect(result.recipe?.id).toBe(recipe.id);
    expect(result.state.discoveredRecipeIds).toContain(recipe.id);
    expect(result.state.xp).toBe(state.xp + recipe.researchXp);
    for (const id of ingredientIds) {
      const [kind, itemId] = id.split(":");
      const balance = kind === "farm"
        ? result.balances.farm[itemId]
        : kind === "fishing"
          ? result.balances.fishing[itemId]
          : result.balances.kitchen[id];
      expect(balance).toBe(4);
    }
  });

  it("records a no-hint failure with small xp and one failed dish", () => {
    const ingredientIds = [
      "farm:wheat",
      "farm:milk",
      "farm:rice",
    ] as const;
    expect(findSecretRecipe("stir_fry", ingredientIds)).toBeNull();
    const state = {
      ...emptyCookingState(NOW),
      xp: cookingLevelXpThreshold(10),
    };

    const result = resolveCookingResearch({
      state,
      method: "stir_fry",
      ingredientIds,
      balances: balancesFor(ingredientIds),
      failedBefore: false,
    });

    expect(result).toMatchObject({
      kind: "failure",
      failedDishCount: 1,
      comboHash: cookingCombinationHash("stir_fry", ingredientIds),
    });
    expect(result.state.xp).toBe(state.xp + 6);
    expect(result.state.stats.researchFailures).toBe(1);
    expect(result).not.toHaveProperty("nearMatch");
  });

  it("blocks a repeated failed combination before checking or consuming materials", () => {
    const ingredientIds = ["farm:wheat", "farm:milk", "farm:rice"] as const;
    expect(() =>
      resolveCookingResearch({
        state: { ...emptyCookingState(NOW), xp: cookingLevelXpThreshold(10) },
        method: "stir_fry",
        ingredientIds,
        balances: balancesFor(ingredientIds, 0),
        failedBefore: true,
      }),
    ).toThrow("duplicate_combination");
  });

  it("enforces method unlocks, slot limits, and duplicate ingredient rejection", () => {
    expect(researchSlotLimitForLevel(1)).toBe(2);
    expect(researchSlotLimitForLevel(10)).toBe(3);
    expect(researchSlotLimitForLevel(20)).toBe(4);
    expect(researchSlotLimitForLevel(35)).toBe(5);

    const state = emptyCookingState(NOW);
    expect(() =>
      resolveCookingResearch({
        state,
        method: "bake",
        ingredientIds: ["farm:wheat", "farm:egg"],
        balances: balancesFor(["farm:wheat", "farm:egg"]),
        failedBefore: false,
      }),
    ).toThrow("method_locked");
    expect(() =>
      resolveCookingResearch({
        state,
        method: "grill",
        ingredientIds: ["farm:wheat", "farm:egg", "farm:milk"],
        balances: balancesFor(["farm:wheat", "farm:egg", "farm:milk"]),
        failedBefore: false,
      }),
    ).toThrow("too_many_ingredients");
    expect(() =>
      resolveCookingResearch({
        state,
        method: "grill",
        ingredientIds: ["farm:wheat", "farm:wheat"],
        balances: balancesFor(["farm:wheat"]),
        failedBefore: false,
      }),
    ).toThrow("invalid_combination");
  });
});
