import { describe, expect, it } from "vitest";

import { COOKING_PUBLIC_RECIPE_BY_ID } from "./catalog";
import {
  COOKING_BUFF_DURATION_MS,
  activeCookingBuff,
  cookingFoodDefinition,
  cookingFoodId,
  parseCookingFoodId,
  scaleCookingEffect,
} from "./food";

describe("cooking v2 food", () => {
  it("round-trips quality, originator, and specialty bonus in a tradeable id", () => {
    const id = cookingFoodId({
      recipeId: "ranch_grand_feast",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });

    expect(id).toBe("food2:ranch_grand_feast:masterpiece:o1:s5");
    expect(parseCookingFoodId(id)).toEqual({
      id,
      recipeId: "ranch_grand_feast",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });
  });

  it("adds quality, originator, and specialty performance to at most 135 percent", () => {
    const recipe = COOKING_PUBLIC_RECIPE_BY_ID.get("ranch_grand_feast")!;
    const effect = scaleCookingEffect({ combatFlat: { atk: 100 } }, {
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });

    expect(effect.combatFlat?.atk).toBe(135);
    expect(
      cookingFoodDefinition(
        cookingFoodId({
          recipeId: recipe.id,
          quality: "masterpiece",
          originator: true,
          specialtyBonusPct: 5,
        }),
      )?.performancePct,
    ).toBe(135);
  });

  it("applies hard caps after scaling", () => {
    expect(
      scaleCookingEffect(
        {
          primaryPct: { str: 20 },
          combatFlat: { atk: 9_000, maxHp: 99_000 },
          huntExpPct: 80,
          huntGoldPct: 80,
        },
        {
          quality: "masterpiece",
          originator: true,
          specialtyBonusPct: 5,
        },
      ),
    ).toEqual({
      primaryPct: { str: 5 },
      combatFlat: { atk: 300, maxHp: 3_000 },
      huntExpPct: 15,
      huntGoldPct: 15,
    });
  });

  it("accepts only unexpired twelve-hour v2 buffs", () => {
    const now = Date.now();
    const buff = activeCookingBuff(
      {
        recipeId: "ranch_grand_feast",
        recipeName: "목장 대만찬",
        quality: "normal",
        effect: { combatFlat: { atk: 300 } },
        expiresAt: now + COOKING_BUFF_DURATION_MS,
      },
      now,
    );

    expect(buff?.expiresAt).toBe(now + COOKING_BUFF_DURATION_MS);
    expect(activeCookingBuff({ ...buff, expiresAt: now }, now)).toBeNull();
  });
});
