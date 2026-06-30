import { describe, expect, it } from "vitest";
import {
  GUILD_WORKSHOP_RECIPES,
  addGuildWorkshopCraftStat,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopQualityChancePct,
  guildWorkshopRecipeView,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopStats,
  rollGuildWorkshopEnhance,
} from "./guildWorkshop";
import { GUILD_WORKSHOP_MATERIAL_ID } from "./guildWorkshopMaterials";
import { V2_EQUIPMENT } from "./v2Equipment";

const ENOUGH_WORKSHOP_MATERIALS = {
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 99,
};

describe("guild workshop recipes", () => {
  it("keeps starter smithy recipes open at blacksmith level 1", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.iron_sword;
    expect(meetsGuildWorkshopRecipeLevel({}, recipe)).toBe(true);
    expect(guildWorkshopRecipeView(recipe, { crop: 99, ore: 99 }).canCraft).toBe(
      true,
    );
  });

  it("locks advanced recipes behind blacksmith level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.mithril_sword;
    expect(guildWorkshopRecipeView(recipe, { crop: 99, ore: 99 }).canCraft).toBe(
      false,
    );
    expect(
      guildWorkshopRecipeView(recipe, { crop: 999, ore: 999 }, {
        blacksmith: { xp: 2200, crafts: 40 },
      }).canCraft,
    ).toBe(true);
  });

  it("exposes mid and high tier craft recipes", () => {
    expect(GUILD_WORKSHOP_RECIPES.greatsword.requiredArtisanLevel).toBe(3);
    expect(GUILD_WORKSHOP_RECIPES.mithril_sword.requiredArtisanLevel).toBe(5);
    expect(GUILD_WORKSHOP_RECIPES.mana_essence.equipmentId).toBe(
      "v2_mana_essence",
    );
  });

  it("exposes craft-only signature recipes at high blacksmith levels", () => {
    expect(GUILD_WORKSHOP_RECIPES.crafted_oathblade).toMatchObject({
      equipmentId: "v2_crafted_oathblade",
      requiredArtisanLevel: 6,
      requiredSmithyLevel: 2,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_master_ring).toMatchObject({
      equipmentId: "v2_crafted_master_ring",
      requiredArtisanLevel: 7,
      requiredSmithyLevel: 3,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_ward_plate).toMatchObject({
      equipmentId: "v2_crafted_ward_plate",
      requiredSmithyLevel: 3,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_sunforge_blade).toMatchObject({
      equipmentId: "v2_crafted_sunforge_blade",
      requiredSmithyLevel: 4,
      requiredArtisanLevel: 8,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_aurora_crown).toMatchObject({
      equipmentId: "v2_crafted_aurora_crown",
      requiredSmithyLevel: 5,
      requiredArtisanLevel: 9,
    });
    expect(
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES.crafted_oathblade,
        { crop: 999, ore: 999 },
        { blacksmith: { xp: 3300, crafts: 40 } },
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
      ).craftOnly,
    ).toBe(true);
  });

  it("locks premium recipes behind smithy level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_master_ring;
    const artisan = { blacksmith: { xp: 4700, crafts: 50 } };
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 999, ore: 999 },
        artisan,
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ smithyLevelOk: false, canCraft: false });
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 999, ore: 999 },
        artisan,
        0,
        3,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ smithyLevelOk: true, canCraft: true });
  });

  it("locks late smithy recipes behind Lv4 and Lv5", () => {
    const artisan = { blacksmith: { xp: 9300, crafts: 80 } };
    expect(
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES.crafted_sunforge_blade,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        3,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ smithyLevelOk: false, canCraft: false });
    expect(
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES.crafted_sunforge_blade,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        4,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ smithyLevelOk: true, canCraft: true });
    expect(
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES.crafted_aurora_crown,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        4,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ smithyLevelOk: false, canCraft: false });
  });

  it("requires tiered personal materials for craft-only equipment", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_sunforge_blade;
    const artisan = { blacksmith: { xp: 9300, crafts: 80 } };
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        4,
        { [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2 },
      ),
    ).toMatchObject({ resourceOk: true, materialOk: false, canCraft: false });
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        4,
        ENOUGH_WORKSHOP_MATERIALS,
      ),
    ).toMatchObject({ resourceOk: true, materialOk: true, canCraft: true });
  });

  it("keeps craft-only recipe costs and xp stepped by smithy tier", () => {
    const craftOnly = Object.values(GUILD_WORKSHOP_RECIPES)
      .filter((recipe) => recipe.id.startsWith("crafted_"))
      .sort(
        (a, b) =>
          (a.requiredSmithyLevel ?? 1) - (b.requiredSmithyLevel ?? 1) ||
          a.requiredArtisanLevel - b.requiredArtisanLevel,
      );
    const totalsBySmithy = new Map<number, number[]>();
    for (const recipe of craftOnly) {
      const smithyLevel = recipe.requiredSmithyLevel ?? 1;
      const totalCost = (recipe.cost.crop ?? 0) + (recipe.cost.ore ?? 0);
      totalsBySmithy.set(smithyLevel, [
        ...(totalsBySmithy.get(smithyLevel) ?? []),
        totalCost,
      ]);
      expect(recipe.artisanXp).toBeGreaterThanOrEqual(60);
    }
    expect(Math.min(...(totalsBySmithy.get(2) ?? []))).toBeGreaterThan(350);
    expect(Math.min(...(totalsBySmithy.get(3) ?? []))).toBeGreaterThan(
      Math.max(...(totalsBySmithy.get(2) ?? [])),
    );
    expect(Math.min(...(totalsBySmithy.get(4) ?? []))).toBeGreaterThan(
      Math.max(...(totalsBySmithy.get(3) ?? [])),
    );
    expect(Math.min(...(totalsBySmithy.get(5) ?? []))).toBeGreaterThan(
      Math.max(...(totalsBySmithy.get(4) ?? [])),
    );
  });

  it("craft-only equipment tiers follow smithy progression", () => {
    const expectedTierBySmithyLevel = new Map([
      [2, 4],
      [3, 6],
      [4, 8],
      [5, 10],
    ]);
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES).filter((r) =>
      r.id.startsWith("crafted_"),
    )) {
      const smithyLevel = recipe.requiredSmithyLevel ?? 1;
      expect(V2_EQUIPMENT[recipe.equipmentId].tier, recipe.id).toBe(
        expectedTierBySmithyLevel.get(smithyLevel),
      );
    }
  });

  it("separates level gate from resource gate", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.leather_gloves;
    const view = guildWorkshopRecipeView(recipe, { crop: 0, ore: 0 }, {
      blacksmith: { xp: 260, crafts: 9 },
    });
    expect(view.levelOk).toBe(true);
    expect(view.resourceOk).toBe(false);
    expect(view.canCraft).toBe(false);
  });

  it("scales crafted +1 quality chance by artisan level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.iron_sword;
    expect(guildWorkshopQualityChancePct({}, recipe)).toBe(3);
    expect(
      guildWorkshopQualityChancePct(
        { blacksmith: { xp: 650, crafts: 20 } },
        recipe,
      ),
    ).toBe(7);
  });

  it("adds guild workshop bonus tiers to crafted quality chance", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.iron_sword;
    expect(guildWorkshopBonusFromTotalCrafts(49)).toEqual({
      totalCrafts: 49,
      qualityChanceBonusPct: 0,
      tier: 0,
      nextTotalCrafts: 50,
    });
    expect(guildWorkshopBonusFromTotalCrafts(300).qualityChanceBonusPct).toBe(3);
    expect(
      guildWorkshopQualityChancePct(
        { blacksmith: { xp: 12500, crafts: 200 } },
        recipe,
        guildWorkshopBonusFromTotalCrafts(600),
      ),
    ).toBe(25);
  });

  it("rolls +1 crafted quality using the recipe quality chance", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.iron_sword;
    expect(rollGuildWorkshopEnhance({}, recipe, () => 0)).toEqual({
      level: 1,
      bonusPct: 2,
    });
    expect(rollGuildWorkshopEnhance({}, recipe, () => 0.99)).toBeUndefined();
  });

  it("parses and increments workshop craft statistics", () => {
    const stats = parseGuildWorkshopStats({
      totalCrafts: 2.9,
      qualityCrafts: 1,
      craftedByRecipe: { iron_sword: 2, unknown: 99 },
    });
    expect(stats).toEqual({
      totalCrafts: 2,
      qualityCrafts: 1,
      craftedByRecipe: { iron_sword: 2 },
    });
    expect(addGuildWorkshopCraftStat(stats, "silver_ring", true)).toEqual({
      totalCrafts: 3,
      qualityCrafts: 2,
      craftedByRecipe: { iron_sword: 2, silver_ring: 1 },
    });
  });
});
