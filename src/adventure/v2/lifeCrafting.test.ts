import { describe, expect, it } from "vitest";
import {
  emptyLifeCraftingState,
  lifeAidSpec,
  parseLifeCraftingState,
  recipeMasteryStage,
  rollHiddenBlueprint,
} from "./lifeCrafting";

describe("life crafting", () => {
  it("keeps only valid balances and active aids", () => {
    const state = parseLifeCraftingState({
      balances: { organic_fertilizer: 3, unknown: 99 },
      activeAids: {
        woodcutting: { itemId: "logging_wedge_basic", remainingUses: 12, enabled: true },
        fishing: { itemId: "organic_fertilizer", remainingUses: 5, enabled: true },
      },
    });
    expect(state.balances).toEqual({ organic_fertilizer: 3 });
    expect(state.activeAids.woodcutting?.remainingUses).toBe(12);
    expect(state.activeAids.fishing).toBeUndefined();
  });

  it("uses the approved grade bands, charges and bonuses", () => {
    expect(lifeAidSpec("logging_wedge_basic")).toMatchObject({ gradeMin: 1, gradeMax: 2, uses: 300, bonusPct: 10 });
    expect(lifeAidSpec("mining_probe_advanced")).toMatchObject({ gradeMin: 3, gradeMax: 4, uses: 400, bonusPct: 8, byproductMultiplier: 1.25 });
    expect(lifeAidSpec("logging_wedge_master")).toMatchObject({ gradeMin: 5, gradeMax: 6, uses: 500, bonusPct: 6 });
  });

  it("opens recipe batch milestones at 1, 5, 15, 40 and 100", () => {
    expect([0, 1, 5, 15, 40, 100].map(recipeMasteryStage)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("discovers an eligible hidden recipe without duplicates", () => {
    const first = rollHiddenBlueprint(emptyLifeCraftingState(), "farming", 1, () => 0);
    expect(first.recipe?.id).toBe("herb_display_planter");
    const second = rollHiddenBlueprint(first.state, "farming", 100, () => 0);
    expect(second.recipe).toBeNull();
    expect(second.state.learnedHiddenRecipeIds).toEqual(["herb_display_planter"]);
  });
});
