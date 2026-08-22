import { describe, expect, it } from "vitest";

import { BASIC_COOKING_RECIPE_IDS, COOKING_PUBLIC_RECIPES } from "./catalog";
import {
  chooseCookingSpecialty,
  cookingLevelXpThreshold,
  cookingSpecialtyRank,
  emptyCookingState,
  parseCookingState,
} from "./state";

const NOW = new Date("2026-08-22T01:00:00.000Z").getTime();
const TEN_HIDDEN_IDS = COOKING_PUBLIC_RECIPES.filter(
  (entry) => entry.discovery === "hidden",
)
  .slice(0, 10)
  .map((entry) => entry.id);

describe("cooking v2 state", () => {
  it("auto-knows exactly the six basics and preserves valid progress", () => {
    const state = parseCookingState(
      {
        version: 2,
        xp: 12_345,
        discoveredRecipeIds: [TEN_HIDDEN_IDS[0], "invalid_recipe"],
        researchScore: 77,
      },
      NOW,
    );

    expect(state.version).toBe(2);
    expect(state.xp).toBe(12_345);
    expect(state.researchScore).toBe(77);
    expect(state.discoveredRecipeIds).toEqual([
      ...BASIC_COOKING_RECIPE_IDS,
      TEN_HIDDEN_IDS[0],
    ]);
  });

  it("chooses a permanent specialty only at level 20 with ten hidden discoveries", () => {
    const ineligible = emptyCookingState(NOW);
    expect(() => chooseCookingSpecialty(ineligible, "hearth")).toThrow(
      "specialty_locked",
    );

    const eligible = parseCookingState(
      {
        ...emptyCookingState(NOW),
        xp: cookingLevelXpThreshold(20),
        discoveredRecipeIds: [...BASIC_COOKING_RECIPE_IDS, ...TEN_HIDDEN_IDS],
      },
      NOW,
    );
    const chosen = chooseCookingSpecialty(eligible, "hearth");
    expect(chosen.specialty).toEqual({ field: "hearth", xp: 0 });
    expect(() => chooseCookingSpecialty(chosen, "pot")).toThrow(
      "specialty_permanent",
    );
  });

  it("derives five bounded specialty ranks from accumulated xp", () => {
    expect(cookingSpecialtyRank(0)).toBe(1);
    expect(cookingSpecialtyRank(299)).toBe(2);
    expect(cookingSpecialtyRank(700)).toBe(4);
    expect(cookingSpecialtyRank(99_999)).toBe(5);
  });

  it("resets daily and weekly delivery progress on their own boundaries", () => {
    const previous = {
      ...emptyCookingState(NOW),
      daily: {
        dayKey: "2026-08-20",
        standingDeliveries: 10,
        requestScores: { old: 50 },
        completedRequestIds: ["old"],
      },
      weekly: {
        weekKey: "2026-W32",
        requestScore: 200,
        completed: true,
      },
    };
    const parsed = parseCookingState(previous, NOW);

    expect(parsed.daily.standingDeliveries).toBe(0);
    expect(parsed.daily.requestScores).toEqual({});
    expect(parsed.weekly.requestScore).toBe(0);
    expect(parsed.weekly.completed).toBe(false);
  });
});
