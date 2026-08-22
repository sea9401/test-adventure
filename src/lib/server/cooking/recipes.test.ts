import { describe, expect, it } from "vitest";

import {
  COOKING_SECRET_RECIPES,
  canonicalCookingCombination,
  findSecretRecipe,
  validateCookingRecipeCatalog,
} from "./recipes";
import { COOKING_METHOD_UNLOCK_LEVEL } from "@/adventure/v2/cooking/types";

describe("hidden cooking recipe catalog", () => {
  it("defines six basic and ninety-four hidden recipes with unique answers", () => {
    const answers = COOKING_SECRET_RECIPES.map((entry) =>
      canonicalCookingCombination(
        entry.method,
        entry.ingredients.map((ingredient) => ingredient.id),
      ),
    );

    expect(COOKING_SECRET_RECIPES).toHaveLength(100);
    expect(
      COOKING_SECRET_RECIPES.filter((entry) => entry.discovery === "basic"),
    ).toHaveLength(6);
    expect(new Set(answers).size).toBe(100);
    expect(validateCookingRecipeCatalog()).toEqual([]);
  });

  it("matches ingredient sets without exposing order or quantities as answers", () => {
    const first = findSecretRecipe("bake", [
      "farm:egg",
      "farm:wheat",
    ]);
    const reordered = findSecretRecipe("bake", [
      "farm:wheat",
      "farm:egg",
    ]);

    expect(first?.id).toBe("country_egg_bread");
    expect(reordered?.id).toBe(first?.id);
  });

  it("rejects duplicate ingredients instead of treating them as a quantity hint", () => {
    expect(
      canonicalCookingCombination("bake", [
        "farm:egg",
        "farm:egg",
        "processed:flour",
      ]),
    ).toBeNull();
    expect(
      findSecretRecipe("bake", [
        "farm:egg",
        "farm:egg",
        "processed:flour",
      ]),
    ).toBeNull();
  });

  it("never exposes a hidden recipe before its cooking method unlocks", () => {
    for (const recipe of COOKING_SECRET_RECIPES) {
      if (recipe.discovery === "basic") continue;
      expect(recipe.requiredLevel).toBeGreaterThanOrEqual(
        COOKING_METHOD_UNLOCK_LEVEL[recipe.method],
      );
    }
  });
});
