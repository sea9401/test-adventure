import { describe, expect, it } from "vitest";
import {
  LIFE_CRAFTING_RECIPES,
  LIFE_HOUSING_ENABLED,
  activateLifeAid,
  consumeLifeAidUses,
  emptyLifeCraftingState,
  lifeBlueprintSourceLabel,
  lifeAidSpec,
  isLifeCraftingRecipeAvailable,
  parseLifeCraftingState,
  recipeMasteryStage,
  rollHiddenBlueprint,
} from "./lifeCrafting";
import { LIFE_PROCESSED_MATERIAL_ID } from "./lifeWorkshopMaterials";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";

describe("life crafting", () => {
  it("keeps only valid balances and active aids", () => {
    const state = parseLifeCraftingState({
      balances: { organic_fertilizer: 3, unknown: 99 },
      reserveAidUses: {
        logging_wedge_advanced: 321,
        organic_fertilizer: 3,
        unknown: 99,
      },
      activeAids: {
        woodcutting: { itemId: "logging_wedge_basic", remainingUses: 12, enabled: true },
        fishing: { itemId: "organic_fertilizer", remainingUses: 5, enabled: true },
      },
    });
    expect(state.balances).toEqual({ organic_fertilizer: 3 });
    expect(state.activeAids.woodcutting?.remainingUses).toBe(12);
    expect(state.activeAids.fishing).toBeUndefined();
    expect(state.reserveAidUses).toEqual({ logging_wedge_advanced: 321 });
  });

  it("preserves ranch feed crafting records stored outside workshop balances", () => {
    const state = parseLifeCraftingState({
      balances: { compound_feed: 50 },
      craftCounts: { compound_feed: 7 },
      discoveredRecipeIds: ["compound_feed"],
      totalCrafts: 7,
    });

    expect(state.balances).not.toHaveProperty("compound_feed");
    expect(state.craftCounts.compound_feed).toBe(7);
    expect(state.discoveredRecipeIds).toContain("compound_feed");
    expect(state.totalCrafts).toBe(7);
  });

  it("switches aid tiers without losing the remaining uses", () => {
    const initial = parseLifeCraftingState({
      balances: { logging_wedge_advanced: 1 },
      activeAids: {
        woodcutting: {
          itemId: "logging_wedge_basic",
          remainingUses: 599,
          enabled: true,
        },
      },
    });

    const advanced = activateLifeAid(initial, "logging_wedge_advanced");
    expect(advanced).toMatchObject({ replaced: true, resumed: false });
    expect(advanced?.state.activeAids.woodcutting).toMatchObject({
      itemId: "logging_wedge_advanced",
      remainingUses: 800,
      enabled: true,
    });
    expect(advanced?.state.reserveAidUses).toEqual({ logging_wedge_basic: 599 });
    expect(advanced?.state.balances.logging_wedge_advanced).toBeUndefined();

    const basic = activateLifeAid(advanced!.state, "logging_wedge_basic");
    expect(basic).toMatchObject({ replaced: true, resumed: true });
    expect(basic?.state.activeAids.woodcutting).toMatchObject({
      itemId: "logging_wedge_basic",
      remainingUses: 599,
      enabled: true,
    });
    expect(basic?.state.reserveAidUses).toEqual({ logging_wedge_advanced: 800 });
  });

  it("charges an in-flight gathering action to the aid moved into reserve", () => {
    const state = parseLifeCraftingState({
      reserveAidUses: { logging_wedge_basic: 599 },
      activeAids: {
        woodcutting: {
          itemId: "logging_wedge_advanced",
          remainingUses: 800,
          enabled: true,
        },
      },
    });

    const result = consumeLifeAidUses(state, "woodcutting", "logging_wedge_basic", 1);
    expect(result.consumed).toBe(1);
    expect(result.state.reserveAidUses.logging_wedge_basic).toBe(598);
    expect(result.state.activeAids.woodcutting?.remainingUses).toBe(800);
    expect(result.state.aidsUsed).toBe(1);
  });

  it("continues using identical spare aids after the active one runs out", () => {
    const state = parseLifeCraftingState({
      balances: { logging_wedge_basic: 2 },
      activeAids: {
        woodcutting: {
          itemId: "logging_wedge_basic",
          remainingUses: 2,
          enabled: true,
        },
      },
    });

    const result = consumeLifeAidUses(
      state,
      "woodcutting",
      "logging_wedge_basic",
      605,
    );

    expect(result.consumed).toBe(605);
    expect(result.state.balances.logging_wedge_basic).toBeUndefined();
    expect(result.state.activeAids.woodcutting).toEqual({
      itemId: "logging_wedge_basic",
      remainingUses: 597,
      enabled: true,
    });
    expect(result.state.aidsUsed).toBe(605);
  });

  it("readies the next identical spare when an enabled aid ends on the last action", () => {
    const state = parseLifeCraftingState({
      balances: { mining_probe_basic: 2 },
      activeAids: {
        mining: {
          itemId: "mining_probe_basic",
          remainingUses: 1,
          enabled: true,
        },
      },
    });

    const result = consumeLifeAidUses(
      state,
      "mining",
      "mining_probe_basic",
      1,
    );

    expect(result.consumed).toBe(1);
    expect(result.state.balances.mining_probe_basic).toBe(1);
    expect(result.state.activeAids.mining).toEqual({
      itemId: "mining_probe_basic",
      remainingUses: 600,
      enabled: true,
    });
    expect(result.state.aidsUsed).toBe(1);
  });

  it("does not open a spare after the selected aid is turned off", () => {
    const state = parseLifeCraftingState({
      balances: { tidy_bait_box: 1 },
      activeAids: {
        fishing: {
          itemId: "tidy_bait_box",
          remainingUses: 1,
          enabled: false,
        },
      },
    });

    const result = consumeLifeAidUses(
      state,
      "fishing",
      "tidy_bait_box",
      2,
    );

    expect(result.consumed).toBe(1);
    expect(result.state.balances.tidy_bait_box).toBe(1);
    expect(result.state.activeAids.fishing).toBeUndefined();
    expect(result.state.aidsUsed).toBe(1);
  });

  it("does not open a reserved aid spare after another tier is selected", () => {
    const state = parseLifeCraftingState({
      balances: { logging_wedge_basic: 1 },
      reserveAidUses: { logging_wedge_basic: 1 },
      activeAids: {
        woodcutting: {
          itemId: "logging_wedge_advanced",
          remainingUses: 800,
          enabled: true,
        },
      },
    });

    const result = consumeLifeAidUses(
      state,
      "woodcutting",
      "logging_wedge_basic",
      2,
    );

    expect(result.consumed).toBe(1);
    expect(result.state.balances.logging_wedge_basic).toBe(1);
    expect(result.state.reserveAidUses.logging_wedge_basic).toBeUndefined();
    expect(result.state.activeAids.woodcutting).toEqual({
      itemId: "logging_wedge_advanced",
      remainingUses: 800,
      enabled: true,
    });
    expect(result.state.aidsUsed).toBe(1);
  });

  it("uses the approved grade bands, charges and bonuses", () => {
    expect(lifeAidSpec("logging_wedge_basic")).toMatchObject({ gradeMin: 1, gradeMax: 2, uses: 600, bonusPct: 10 });
    expect(lifeAidSpec("mining_probe_advanced")).toMatchObject({ gradeMin: 3, gradeMax: 4, uses: 800, bonusPct: 8, byproductMultiplier: 1.25 });
    expect(lifeAidSpec("logging_wedge_master")).toMatchObject({ gradeMin: 5, gradeMax: 6, uses: 1_000, bonusPct: 6 });
    expect(lifeAidSpec("tidy_bait_box")).toMatchObject({ uses: 800 });
  });

  it("charges sustainable material bundles for gathering aids", () => {
    const byId = new Map(LIFE_CRAFTING_RECIPES.map((recipe) => [recipe.id, recipe]));
    expect(byId.get("logging_wedge_basic")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.softwood]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 1,
    });
    expect(byId.get("logging_wedge_advanced")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.hardwood]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: 1,
    });
    expect(byId.get("logging_wedge_master")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.masterwood]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 1,
      [MINING_MATERIAL_ID.roughGem]: 1,
    });
    expect(byId.get("mining_probe_basic")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.softwood]: 1,
    });
    expect(byId.get("mining_probe_advanced")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.hardwood]: 1,
    });
    expect(byId.get("mining_probe_master")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 4,
      [LIFE_PROCESSED_MATERIAL_ID.masterwood]: 1,
      [MINING_MATERIAL_ID.roughGem]: 1,
    });
    expect(byId.get("tidy_bait_box")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.hardwood]: 8,
      [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: 4,
    });
    expect(byId.get("organic_fertilizer")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.softwood]: 3,
      [MINING_MATERIAL_ID.coal]: 3,
    });
    expect(byId.get("cooking_prep_set")?.costs).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.softwood]: 3,
      [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 3,
    });
  });

  it("opens recipe batch milestones at 1, 5, 15, 40 and 100", () => {
    expect([0, 1, 5, 15, 40, 100].map(recipeMasteryStage)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("provides an item image for every life aid recipe", () => {
    const aidRecipes = LIFE_CRAFTING_RECIPES.filter((recipe) => recipe.kind === "aid");
    expect(aidRecipes).toHaveLength(9);
    for (const recipe of aidRecipes) {
      expect(recipe.image).toBe(`/images/items/life-aids/${recipe.outputId}.webp`);
    }
  });

  it("shows blueprint activity names in Korean", () => {
    expect([
      lifeBlueprintSourceLabel("woodcutting"),
      lifeBlueprintSourceLabel("mining"),
      lifeBlueprintSourceLabel("fishing"),
      lifeBlueprintSourceLabel("farming"),
      lifeBlueprintSourceLabel("cooking"),
      lifeBlueprintSourceLabel("processing"),
    ]).toEqual(["벌목", "채광", "낚시", "농사", "요리", "가공"]);
    expect(lifeBlueprintSourceLabel()).toBe("생활");
  });

  it("discovers an active hidden aid recipe without duplicates", () => {
    const first = rollHiddenBlueprint(emptyLifeCraftingState(), "woodcutting", 1, () => 0);
    expect(first.recipe?.id).toBe("logging_wedge_master");
    const second = rollHiddenBlueprint(first.state, "woodcutting", 100, () => 0);
    expect(second.recipe).toBeNull();
    expect(second.state.learnedHiddenRecipeIds).toEqual(["logging_wedge_master"]);
  });

  it("90레벨 벌목 보너스는 숨은 설계도 확률에 1%p를 더한다", () => {
    const rolls = [0, 0.005];
    expect(
      rollHiddenBlueprint(
        emptyLifeCraftingState(),
        "woodcutting",
        1,
        () => rolls.shift() ?? 1,
      ).recipe,
    ).toBeNull();

    const bonusRolls = [0, 0.005];
    expect(
      rollHiddenBlueprint(
        emptyLifeCraftingState(),
        "woodcutting",
        1,
        () => bonusRolls.shift() ?? 1,
        1,
      ).recipe?.id,
    ).toBe("logging_wedge_master");
  });

  it("keeps housing recipes dormant without deleting their catalog data", () => {
    expect(LIFE_HOUSING_ENABLED).toBe(false);
    expect(
      LIFE_CRAFTING_RECIPES.filter(isLifeCraftingRecipeAvailable).every(
        (recipe) => recipe.kind === "aid",
      ),
    ).toBe(true);

    const initial = emptyLifeCraftingState();
    const result = rollHiddenBlueprint(initial, "fishing", 100_000, () => 0);
    expect(result.recipe).toBeNull();
    expect(result.state).toBe(initial);
  });
});
