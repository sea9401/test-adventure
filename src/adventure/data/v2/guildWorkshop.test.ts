import { describe, expect, it } from "vitest";
import {
  GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
  GUILD_WORKSHOP_ACTIVITY_MIN_DISPLAY_TIER,
  GUILD_WORKSHOP_RECIPES,
  GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER,
  addGuildWorkshopCraftRecord,
  addGuildWorkshopCraftStat,
  guildWorkshopCraftRecordTitleIds,
  guildWorkshopEquipmentRecordViews,
  addGuildWorkshopMaterials,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopBaseEquipmentCandidates,
  guildWorkshopDismantleArtisanXpForTier,
  guildWorkshopDismantleMaterialForTier,
  guildWorkshopDismantlePlan,
  guildWorkshopQualityChancePct,
  guildWorkshopRecipeView,
  guildWorkshopRecipeResourceMaterialCost,
  guildWorkshopRecipeResourceCost,
  guildWorkshopResourceCostForTier,
  guildWorkshopMiningMaterialForTier,
  guildWorkshopWoodMaterialForTier,
  guildWorkshopRecipeMaterialCost,
  hasGuildWorkshopRecipeMaterials,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopStats,
  parseGuildWorkshopCraftRecords,
  rollGuildWorkshopEnhance,
  shouldLogGuildWorkshopCraftActivity,
  spendGuildWorkshopRecipeCost,
  spendGuildWorkshopBaseEquipment,
  spendGuildWorkshopRecipeMaterials,
  type GuildWorkshopResourceTier,
} from "./guildWorkshop";
import { GUILD_WORKSHOP_MATERIAL_ID } from "./guildWorkshopMaterials";
import { SETTLEMENT_MATERIAL_ID } from "./settlementMaterials";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";
import { MINING_MATERIAL_ID } from "./miningSpots";
import {
  V2_EQUIPMENT,
  v2EquipCatalogTierToDisplayTier,
} from "./v2Equipment";
import { MONSTER_CRAFT_MATERIAL_ID } from "./monsterCraftMaterials";
import { COOP_BOSS_MATERIAL_ID } from "./coopRewards";

const ENOUGH_WORKSHOP_MATERIALS = {
  ...Object.fromEntries(
    Object.values(WOODCUTTING_MATERIAL_ID).map((id) => [id, 99999]),
  ),
  ...Object.fromEntries(
    Object.values(MINING_MATERIAL_ID).map((id) => [id, 99999]),
  ),
  [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 99,
  [GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal]: 99,
  ...Object.fromEntries(
    Object.values(MONSTER_CRAFT_MATERIAL_ID).map((id) => [id, 99]),
  ),
  [COOP_BOSS_MATERIAL_ID.canyon_predator]: 99,
};

describe("guild workshop activity log", () => {
  it("records craft-only equipment from displayed 4T onwards", () => {
    expect(GUILD_WORKSHOP_ACTIVITY_MIN_DISPLAY_TIER).toBe(4);
    expect(
      shouldLogGuildWorkshopCraftActivity(
        V2_EQUIPMENT.v2_crafted_sunforge_blade,
      ),
    ).toBe(false);
    expect(
      shouldLogGuildWorkshopCraftActivity(V2_EQUIPMENT.v2_crafted_aurora_crown),
    ).toBe(true);
    expect(
      shouldLogGuildWorkshopCraftActivity(
        V2_EQUIPMENT.v2_crafted_kingbreaker_axe,
      ),
    ).toBe(true);
  });

  it("does not record non-craft-only equipment even at displayed 4T", () => {
    expect(
      shouldLogGuildWorkshopCraftActivity({ tier: 12, craftOnly: false }),
    ).toBe(false);
  });
});

describe("guild workshop recipes", () => {
  it("uses one distinct wood material for each crafted equipment tier", () => {
    expect([
      guildWorkshopWoodMaterialForTier(4),
      guildWorkshopWoodMaterialForTier(6),
      guildWorkshopWoodMaterialForTier(8),
      guildWorkshopWoodMaterialForTier(10),
      guildWorkshopWoodMaterialForTier(11),
      guildWorkshopWoodMaterialForTier(12),
    ]).toEqual([
      WOODCUTTING_MATERIAL_ID.pine,
      WOODCUTTING_MATERIAL_ID.birch,
      WOODCUTTING_MATERIAL_ID.willow,
      WOODCUTTING_MATERIAL_ID.oak,
      WOODCUTTING_MATERIAL_ID.cedar,
      WOODCUTTING_MATERIAL_ID.cypress,
    ]);

    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
      const tier = V2_EQUIPMENT[recipe.equipmentId].tier;
      const expectedWood = guildWorkshopWoodMaterialForTier(tier);
      const materialCost = guildWorkshopRecipeResourceMaterialCost(recipe);
      expect(materialCost[expectedWood]).toBe(recipe.cost.crop);
      for (const woodId of Object.values(WOODCUTTING_MATERIAL_ID)) {
        if (woodId !== expectedWood) expect(materialCost[woodId]).toBeUndefined();
      }
    }
  });

  it("uses one distinct mined ore for each crafted equipment tier", () => {
    expect([
      guildWorkshopMiningMaterialForTier(4),
      guildWorkshopMiningMaterialForTier(6),
      guildWorkshopMiningMaterialForTier(8),
      guildWorkshopMiningMaterialForTier(10),
      guildWorkshopMiningMaterialForTier(11),
      guildWorkshopMiningMaterialForTier(12),
    ]).toEqual([
      MINING_MATERIAL_ID.iron,
      MINING_MATERIAL_ID.copper,
      MINING_MATERIAL_ID.silver,
      MINING_MATERIAL_ID.gold,
      MINING_MATERIAL_ID.mythril,
      MINING_MATERIAL_ID.adamantite,
    ]);

    const oreIds = [
      MINING_MATERIAL_ID.iron,
      MINING_MATERIAL_ID.copper,
      MINING_MATERIAL_ID.silver,
      MINING_MATERIAL_ID.gold,
      MINING_MATERIAL_ID.mythril,
      MINING_MATERIAL_ID.adamantite,
    ];
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
      const tier = V2_EQUIPMENT[recipe.equipmentId].tier;
      const expectedOre = guildWorkshopMiningMaterialForTier(tier);
      const materialCost = guildWorkshopRecipeResourceMaterialCost(recipe);
      expect(materialCost[expectedOre]).toBe(recipe.cost.ore);
      for (const oreId of oreIds) {
        if (oreId !== expectedOre) expect(materialCost[oreId]).toBeUndefined();
      }
    }
  });

  it("keeps starter craft-only recipes open at blacksmith level 1", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    expect(meetsGuildWorkshopRecipeLevel({}, recipe)).toBe(true);
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 999, ore: 999 },
        {},
        0,
        1,
        ENOUGH_WORKSHOP_MATERIALS,
      ).canCraft,
    ).toBe(true);
  });

  it("locks advanced recipes behind blacksmith level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_guard_ring;
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 999, ore: 999 },
        {},
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
      ).canCraft,
    ).toBe(false);
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 999, ore: 999 },
        {
          blacksmith: { xp: 2200, crafts: 40 },
        },
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
      ).canCraft,
    ).toBe(true);
  });

  it("exposes craft-only equipment, monster upgrades, and one boss upgrade recipe", () => {
    const recipes = Object.values(GUILD_WORKSHOP_RECIPES);
    expect(recipes).toHaveLength(51);
    expect(recipes.every((recipe) => recipe.id.startsWith("crafted_"))).toBe(
      true,
    );
    expect(
      recipes.filter((recipe) => !V2_EQUIPMENT[recipe.equipmentId].craftOnly),
    ).toEqual([GUILD_WORKSHOP_RECIPES.crafted_scorpion_king_stinger]);
  });

  it("exposes craft-only set recipes across smithy levels", () => {
    expect(GUILD_WORKSHOP_RECIPES.crafted_oathblade).toMatchObject({
      equipmentId: "v2_crafted_oathblade",
      requiredArtisanLevel: 1,
      requiredSmithyLevel: 1,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_master_ring).toMatchObject({
      equipmentId: "v2_crafted_master_ring",
      requiredArtisanLevel: 7,
      requiredSmithyLevel: 2,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_ward_plate).toMatchObject({
      equipmentId: "v2_crafted_ward_plate",
      requiredSmithyLevel: 2,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_venom_gland_dagger).toMatchObject({
      equipmentId: "v2_crafted_venom_gland_dagger",
      requiredSmithyLevel: 2,
      requiredArtisanLevel: 5,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_fury_necklace).toMatchObject({
      equipmentId: "v2_crafted_fury_necklace",
      requiredSmithyLevel: 3,
      requiredArtisanLevel: 6,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_combo_bow).toMatchObject({
      equipmentId: "v2_crafted_combo_bow",
      resourceProfile: "combo",
      requiredSmithyLevel: 1,
      requiredArtisanLevel: 1,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_corrosion_necklace).toMatchObject({
      equipmentId: "v2_crafted_corrosion_necklace",
      resourceProfile: "corrosion",
      requiredSmithyLevel: 3,
      requiredArtisanLevel: 6,
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
    expect(GUILD_WORKSHOP_RECIPES.crafted_bulwark_shield).toMatchObject({
      equipmentId: "v2_crafted_bulwark_shield",
      requiredSmithyLevel: 5,
      requiredArtisanLevel: 10,
    });
    expect(GUILD_WORKSHOP_RECIPES.crafted_kingbreaker_axe).toMatchObject({
      equipmentId: "v2_crafted_kingbreaker_axe",
      requiredSmithyLevel: 5,
      requiredArtisanLevel: 11,
    });
    expect(
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES.crafted_oathblade,
        { crop: 999, ore: 999 },
        {},
        0,
        1,
        ENOUGH_WORKSHOP_MATERIALS,
      ).craftOnly,
    ).toBe(true);
  });

  it("locks premium recipes behind smithy level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_fury_necklace;
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
        {
          [WOODCUTTING_MATERIAL_ID.willow]: 99999,
          [MINING_MATERIAL_ID.silver]: 99999,
          [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
        },
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

  it("requires the cave-spider material for the venom dagger", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_venom_gland_dagger;
    const withoutVenom: Record<string, number> = {
      ...ENOUGH_WORKSHOP_MATERIALS,
    };
    delete withoutVenom[MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland];

    expect(guildWorkshopRecipeMaterialCost(recipe)).toMatchObject({
      [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2,
      [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland]: 12,
    });
    expect(hasGuildWorkshopRecipeMaterials(withoutVenom, recipe)).toBe(false);
    expect(hasGuildWorkshopRecipeMaterials(ENOUGH_WORKSHOP_MATERIALS, recipe)).toBe(
      true,
    );
    expect(guildWorkshopRecipeMaterialCost(recipe, "masterwork")).toMatchObject({
      [MONSTER_CRAFT_MATERIAL_ID.caveSpiderVenomGland]: 24,
    });
  });

  it("uses one venom dagger and boss materials for the scorpion upgrade", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_scorpion_king_stinger;
    const artisan = { blacksmith: { xp: 9300, crafts: 80 } };
    expect(recipe).toMatchObject({
      equipmentId: "v2_boss_canyon_fang",
      baseEquipmentId: "v2_crafted_venom_gland_dagger",
      requiredSmithyLevel: 2,
    });
    expect(guildWorkshopRecipeMaterialCost(recipe)).toMatchObject({
      [COOP_BOSS_MATERIAL_ID.canyon_predator]: 8,
    });
    expect(guildWorkshopRecipeMaterialCost(recipe, "masterwork")).toMatchObject({
      [COOP_BOSS_MATERIAL_ID.canyon_predator]: 16,
    });
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
        0,
      ),
    ).toMatchObject({ canCraft: false, baseEquipment: { eligibleCount: 0 } });
    expect(
      guildWorkshopRecipeView(
        recipe,
        { crop: 9999, ore: 9999 },
        artisan,
        0,
        2,
        ENOUGH_WORKSHOP_MATERIALS,
        1,
      ),
    ).toMatchObject({
      canCraft: true,
      baseEquipment: { requiredCount: 1, eligibleCount: 1, resetOnCraft: true },
    });
  });

  it("crafts the nine regular monster-material items directly without base equipment", () => {
    const cases = [
      [
        "crafted_pulsestone_guard",
        "v2_crafted_pulsestone_guard",
        MONSTER_CRAFT_MATERIAL_ID.rockGolemResonantCore,
        6,
        2,
      ],
      [
        "crafted_thundercoil_gloves",
        "v2_crafted_thundercoil_gloves",
        MONSTER_CRAFT_MATERIAL_ID.sparkScorpionConductiveSac,
        6,
        2,
      ],
      [
        "crafted_veinbreaker_bow",
        "v2_crafted_veinbreaker_bow",
        MONSTER_CRAFT_MATERIAL_ID.abyssWormBurrowingJaw,
        6,
        2,
      ],
      [
        "crafted_luminous_aegis_necklace",
        "v2_crafted_luminous_aegis_necklace",
        MONSTER_CRAFT_MATERIAL_ID.starlightGatekeeperLuminousCore,
        7,
        3,
      ],
      [
        "crafted_toxic_mist_gloves",
        "v2_crafted_toxic_mist_gloves",
        MONSTER_CRAFT_MATERIAL_ID.poisonMistSpiritToxicCore,
        7,
        3,
      ],
      [
        "crafted_voidstep_boots",
        "v2_crafted_voidstep_boots",
        MONSTER_CRAFT_MATERIAL_ID.voidBeastShadowClaw,
        8,
        4,
      ],
      [
        "crafted_fracture_blade",
        "v2_crafted_fracture_blade",
        MONSTER_CRAFT_MATERIAL_ID.plateauSlayerSerratedBone,
        12,
        5,
      ],
      [
        "crafted_thunder_oracle_grimoire",
        "v2_crafted_thunder_oracle_grimoire",
        MONSTER_CRAFT_MATERIAL_ID.lightningOracleThunderRunestone,
        12,
        5,
      ],
      [
        "crafted_trench_hymn_necklace",
        "v2_crafted_trench_hymn_necklace",
        MONSTER_CRAFT_MATERIAL_ID.trenchApostlePrayerCore,
        12,
        5,
      ],
    ] as const;

    for (const [recipeId, equipmentId, materialId, level, smithy] of cases) {
      const recipe = GUILD_WORKSHOP_RECIPES[recipeId];
      expect(recipe).toMatchObject({
        equipmentId,
        requiredArtisanLevel: level,
        requiredSmithyLevel: smithy,
      });
      expect(recipe.baseEquipmentId).toBeUndefined();
      expect(guildWorkshopRecipeMaterialCost(recipe)[materialId]).toBe(12);
      expect(guildWorkshopRecipeMaterialCost(recipe, "masterwork")[materialId]).toBe(
        24,
      );
      expect(
        guildWorkshopRecipeView(
          recipe,
          { crop: 9999, ore: 9999 },
          { blacksmith: { xp: 999999, crafts: 999 } },
          0,
          5,
          ENOUGH_WORKSHOP_MATERIALS,
          0,
        ),
      ).toMatchObject({ canCraft: true, baseEquipment: null });
    }
  });

  it("consumes the lowest-value unlocked and unequipped venom dagger", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_scorpion_king_stinger;
    const owned = [
      { iid: "equipped", id: "v2_crafted_venom_gland_dagger" as const },
      {
        iid: "locked",
        id: "v2_crafted_venom_gland_dagger" as const,
        locked: true,
      },
      {
        iid: "enhanced",
        id: "v2_crafted_venom_gland_dagger" as const,
        enhance: { level: 2, bonusPct: 2 },
      },
      {
        iid: "quality",
        id: "v2_crafted_venom_gland_dagger" as const,
        craftQuality: { level: 1 as const, bonusPct: 5 as const },
      },
      {
        iid: "plain-low-roll",
        id: "v2_crafted_venom_gland_dagger" as const,
        roll: { power: 118, weight: 1 },
      },
    ];
    const equipped = { weapon: "equipped" } as const;
    expect(
      guildWorkshopBaseEquipmentCandidates(owned, equipped, recipe).map(
        (instance) => instance.iid,
      ),
    ).toEqual(["plain-low-roll", "quality", "enhanced"]);
    const spent = spendGuildWorkshopBaseEquipment(owned, equipped, recipe);
    expect(spent?.consumed?.iid).toBe("plain-low-roll");
    expect(spent?.owned.map((instance) => instance.iid)).toEqual([
      "equipped",
      "locked",
      "enhanced",
      "quality",
    ]);
  });

  it("aligns every recipe to the tier total and set resource profile", () => {
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
      const tier = V2_EQUIPMENT[recipe.equipmentId]
        .tier as GuildWorkshopResourceTier;
      expect(recipe.cost, recipe.id).toEqual(
        guildWorkshopResourceCostForTier(tier, recipe.resourceProfile),
      );
      expect(
        (recipe.cost.crop ?? 0) + (recipe.cost.ore ?? 0),
        recipe.id,
      ).toBe(GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER[tier]);
      expect(recipe.artisanXp).toBeGreaterThanOrEqual(34);
    }
  });

  it("aligns catalyst totals by smithy level and equipment tier", () => {
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES)) {
      const smithyLevel = recipe.requiredSmithyLevel ?? 1;
      const equipmentTier = V2_EQUIPMENT[recipe.equipmentId].tier;
      const catalystTotal = Object.values(recipe.materialCost ?? {}).reduce(
        (sum, amount) => sum + (amount ?? 0),
        0,
      );
      const expectedTotal =
        smithyLevel === 1
          ? 0
          : smithyLevel === 2
            ? 2
            : smithyLevel === 3
              ? 3
              : smithyLevel === 4
                ? 4
                : equipmentTier === 10
                  ? 4
                  : equipmentTier === 11
                    ? 6
                    : 8;
      expect(catalystTotal, recipe.id).toBe(expectedTotal);
    }
  });

  it("craft-only equipment tiers follow smithy progression", () => {
    const expectedTierRangeBySmithyLevel = new Map([
      [1, [4, 4]],
      [2, [6, 6]],
      [3, [8, 8]],
      [4, [8, 8]],
      [5, [10, 12]],
    ]);
    for (const recipe of Object.values(GUILD_WORKSHOP_RECIPES).filter((r) =>
      r.id.startsWith("crafted_"),
    )) {
      const smithyLevel = recipe.requiredSmithyLevel ?? 1;
      const expectedRange = expectedTierRangeBySmithyLevel.get(smithyLevel);
      expect(expectedRange, recipe.id).toBeDefined();
      const [minTier, maxTier] = expectedRange ?? [0, 0];
      const tier = V2_EQUIPMENT[recipe.equipmentId].tier;
      expect(tier, recipe.id).toBeGreaterThanOrEqual(minTier);
      expect(tier, recipe.id).toBeLessThanOrEqual(maxTier);
    }
  });

  it("separates level gate from resource gate", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_spark_gloves;
    const view = guildWorkshopRecipeView(
      recipe,
      { crop: 999, ore: 999 },
      {
        blacksmith: { xp: 260, crafts: 9 },
      },
      0,
      1,
      {},
    );
    expect(view.levelOk).toBe(true);
    expect(view.resourceOk).toBe(false);
    expect(view.canCraft).toBe(false);
  });

  it("scales crafted +1 quality chance by artisan level", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    expect(guildWorkshopQualityChancePct({}, recipe)).toBe(3);
    expect(
      guildWorkshopQualityChancePct(
        { blacksmith: { xp: 650, crafts: 20 } },
        recipe,
      ),
    ).toBe(7);
  });

  it("adds guild workshop bonus tiers to crafted quality chance", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
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

  it("guarantees +1 crafted quality chance for masterwork mode", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    const artisan = { blacksmith: { xp: 12500, crafts: 200 } };
    const bonus = guildWorkshopBonusFromTotalCrafts(600);
    expect(guildWorkshopQualityChancePct(artisan, recipe, bonus)).toBe(25);
    expect(
      guildWorkshopQualityChancePct(artisan, recipe, bonus, "masterwork"),
    ).toBe(100);
  });

  it("exposes masterwork craft costs and gates in recipe views", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    const artisan = { blacksmith: { xp: 6600, crafts: 60 } };
    const view = guildWorkshopRecipeView(
      recipe,
      { crop: 9999, ore: 9999 },
      artisan,
      0,
      2,
      ENOUGH_WORKSHOP_MATERIALS,
    );

    expect(view.masterwork).toMatchObject({
      requiredArtisanLevel: 8,
      levelOk: true,
      canCraft: true,
      plus2Unlocked: false,
    });
    expect(view.masterwork.cost.crop).toBe(
      (recipe.cost.crop ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
    );
    expect(view.masterwork.materialCost).not.toHaveProperty(
      GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
    );
  });

  it("spends increased resources and materials for masterwork craft mode", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    expect(guildWorkshopRecipeResourceCost(recipe, "masterwork")).toMatchObject({
      crop:
        (recipe.cost.crop ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
      ore:
        (recipe.cost.ore ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
    });
    expect(
      guildWorkshopRecipeResourceMaterialCost(recipe, "masterwork"),
    ).toMatchObject({
      [SETTLEMENT_MATERIAL_ID.timber]:
        (recipe.cost.crop ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
      [SETTLEMENT_MATERIAL_ID.ironOre]:
        (recipe.cost.ore ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
    });
    expect(guildWorkshopRecipeMaterialCost(recipe, "masterwork")).toMatchObject(
      {
        [SETTLEMENT_MATERIAL_ID.timber]:
          (recipe.cost.crop ?? 0) *
          GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
        [SETTLEMENT_MATERIAL_ID.ironOre]:
          (recipe.cost.ore ?? 0) *
          GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
      },
    );
    expect(
      hasGuildWorkshopRecipeMaterials(
        {},
        recipe,
        "masterwork",
      ),
    ).toBe(false);
    expect(
      hasGuildWorkshopRecipeMaterials(
        {
          [SETTLEMENT_MATERIAL_ID.timber]:
            (recipe.cost.crop ?? 0) *
            GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
          [SETTLEMENT_MATERIAL_ID.ironOre]:
            (recipe.cost.ore ?? 0) *
            GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
        },
        recipe,
        "masterwork",
      ),
    ).toBe(true);
    expect(
      spendGuildWorkshopRecipeCost(
        { crop: 9999, ore: 9999 },
        recipe,
        "masterwork",
      ),
    ).toMatchObject({
      crop:
        9999 -
        (recipe.cost.crop ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
      ore:
        9999 -
        (recipe.cost.ore ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
    });
    expect(
      spendGuildWorkshopRecipeMaterials(
        {
          [SETTLEMENT_MATERIAL_ID.timber]: 9999,
          [SETTLEMENT_MATERIAL_ID.ironOre]: 9999,
        },
        recipe,
        "masterwork",
      ),
    ).toMatchObject({
      [SETTLEMENT_MATERIAL_ID.timber]:
        9999 -
        (recipe.cost.crop ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
      [SETTLEMENT_MATERIAL_ID.ironOre]:
        9999 -
        (recipe.cost.ore ?? 0) * GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
    });
  });

  it("rolls +1 crafted quality using the recipe quality chance", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    expect(rollGuildWorkshopEnhance({}, recipe, () => 0)).toEqual({
      level: 1,
      bonusPct: 5,
    });
    expect(rollGuildWorkshopEnhance({}, recipe, () => 0.99)).toBeUndefined();
  });

  it("can roll +2 crafted quality in masterwork mode", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    const rolls = [0, 0];
    const rng = () => rolls.shift() ?? 0.99;
    expect(
      rollGuildWorkshopEnhance(
        { blacksmith: { xp: 12500, crafts: 200 } },
        recipe,
        rng,
        0,
        "masterwork",
      ),
    ).toEqual({
      level: 2,
      bonusPct: 10,
    });
  });

  it("guarantees +1 crafted quality in masterwork mode even on failed +2 roll", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    expect(
      rollGuildWorkshopEnhance(
        { blacksmith: { xp: 12500, crafts: 200 } },
        recipe,
        () => 0.99,
        0,
        "masterwork",
      ),
    ).toEqual({
      level: 1,
      bonusPct: 5,
    });
  });

  it("does not roll +2 quality before blacksmith Lv9", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;
    const rolls = [0, 0];
    const rng = () => rolls.shift() ?? 0.99;
    expect(
      rollGuildWorkshopEnhance(
        { blacksmith: { xp: 6600, crafts: 80 } },
        recipe,
        rng,
        0,
        "masterwork",
      ),
    ).toEqual({
      level: 1,
      bonusPct: 5,
    });
  });

  it("parses and increments workshop craft statistics", () => {
    const stats = parseGuildWorkshopStats({
      totalCrafts: 2.9,
      qualityCrafts: 1,
      craftedByRecipe: { crafted_oathblade: 2, unknown: 99 },
    });
    expect(stats).toEqual({
      totalCrafts: 2,
      qualityCrafts: 1,
      craftedByRecipe: { crafted_oathblade: 2 },
    });
    expect(addGuildWorkshopCraftStat(stats, "crafted_gale_bow", true)).toEqual({
      totalCrafts: 3,
      qualityCrafts: 2,
      craftedByRecipe: { crafted_oathblade: 2, crafted_gale_bow: 1 },
    });
  });

  it("tracks personal craft records by recipe and slot", () => {
    const recipe = GUILD_WORKSHOP_RECIPES.crafted_sunforge_blade;
    const records = addGuildWorkshopCraftRecord(
      parseGuildWorkshopCraftRecords(null),
      {
        recipeId: recipe.id,
        item: V2_EQUIPMENT[recipe.equipmentId],
        craftQualityLevel: 2,
        masterwork: true,
        craftedAt: "2026-06-30T00:00:00.000Z",
      },
    );

    expect(records).toMatchObject({
      totalCrafts: 1,
      qualityCrafts: 1,
      masterworkCrafts: 1,
      craftOnlyCrafts: 1,
      craftOnlySlots: { weapon: 1 },
      highestTier: 8,
      bestQualityLevel: 2,
    });
    expect(records.recipes.crafted_sunforge_blade).toMatchObject({
      crafts: 1,
      bestQualityLevel: 2,
      masterworkCrafts: 1,
    });
    expect(records.slots.weapon).toMatchObject({
      crafts: 1,
      bestQualityLevel: 2,
      masterworkCrafts: 1,
      highestTier: 8,
    });
    expect(guildWorkshopCraftRecordTitleIds(records)).toContain(
      "artisan_double_star_smith",
    );
    expect(guildWorkshopEquipmentRecordViews(records)).toMatchObject({
      v2_crafted_sunforge_blade: {
        recipeId: "crafted_sunforge_blade",
        crafts: 1,
        bestQualityLevel: 2,
      },
    });
  });

  it("grants craft record titles for long-term blacksmith milestones", () => {
    const full = parseGuildWorkshopCraftRecords({
      totalCrafts: 40,
      qualityCrafts: 1,
      masterworkCrafts: 10,
      craftOnlyCrafts: 6,
      craftOnlySlots: {
        weapon: 1,
        armor: 1,
        gloves: 1,
        boots: 1,
        ring: 1,
        necklace: 1,
      },
      highestTier: 10,
      bestQualityLevel: 2,
    });
    expect(guildWorkshopCraftRecordTitleIds(full)).toEqual([
      "artisan_double_star_smith",
      "artisan_masterwork_smith",
      "artisan_high_tier_smith",
      "artisan_full_kit_smith",
    ]);
  });

  it("maps dismantle materials by equipment tier", () => {
    expect(guildWorkshopDismantleMaterialForTier(3)).toBeUndefined();
    expect(guildWorkshopDismantleMaterialForTier(4)).toBe(
      GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
    );
    expect(guildWorkshopDismantleMaterialForTier(6)).toBe(
      GUILD_WORKSHOP_MATERIAL_ID.mithrilShard,
    );
    expect(guildWorkshopDismantleMaterialForTier(8)).toBe(
      GUILD_WORKSHOP_MATERIAL_ID.sunstone,
    );
    expect(guildWorkshopDismantleMaterialForTier(10)).toBe(
      GUILD_WORKSHOP_MATERIAL_ID.auroraCrystal,
    );
  });

  it("keeps dismantle artisan xp as a low auxiliary reward", () => {
    expect(guildWorkshopDismantleArtisanXpForTier(3)).toBe(0);
    expect(guildWorkshopDismantleArtisanXpForTier(4)).toBe(1);
    expect(guildWorkshopDismantleArtisanXpForTier(7)).toBe(1);
    expect(guildWorkshopDismantleArtisanXpForTier(8)).toBe(2);
    expect(guildWorkshopDismantleArtisanXpForTier(11)).toBe(2);
    expect(guildWorkshopDismantleArtisanXpForTier(12)).toBe(3);
    expect(guildWorkshopDismantleArtisanXpForTier(20)).toBe(3);
  });

  it("locks dismantle before blacksmith level 6", () => {
    const item = V2_EQUIPMENT.v2_greatsword;
    expect(guildWorkshopDismantlePlan(item, {}, 5)).toEqual({
      materials: {},
      artisanXp: 0,
      blockedReason: "locked_level",
    });
  });

  it("only recovers workshop materials from blacksmith-crafted equipment", () => {
    const item = V2_EQUIPMENT.v2_canyon_greatsword;
    expect(guildWorkshopDismantlePlan(item, {}, 6)).toEqual({
      materials: {},
      artisanXp: 0,
      blockedReason: "not_crafted",
    });
    expect(
      guildWorkshopDismantlePlan(
        item,
        {
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 6,
            craftedAt: new Date(0).toISOString(),
          },
        },
        6,
      ),
    ).toMatchObject({
      materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 },
      artisanXp: 1,
    });
  });

  it("recovers only materials that the source recipe actually consumed", () => {
    const item = V2_EQUIPMENT.v2_crafted_gale_bow;
    expect(
      guildWorkshopDismantlePlan(
        item,
        {
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 6,
            craftedAt: new Date(0).toISOString(),
          },
        },
        6,
      ),
    ).toMatchObject({
      materials: { [MINING_MATERIAL_ID.iron]: 2 },
      artisanXp: 1,
    });
    expect(
      guildWorkshopDismantlePlan(
        item,
        {
          craftQuality: { level: 2, bonusPct: 10 },
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 9,
            craftedAt: new Date(0).toISOString(),
            masterwork: true,
          },
        },
        9,
      ),
    ).toMatchObject({
      materials: { [MINING_MATERIAL_ID.iron]: 3 },
      artisanXp: 1,
    });
  });

  it("keeps every 2T craft-only workshop recipe available for dismantling", () => {
    const recipes = Object.values(GUILD_WORKSHOP_RECIPES).filter((recipe) => {
      const item = V2_EQUIPMENT[recipe.equipmentId];
      return item.craftOnly && v2EquipCatalogTierToDisplayTier(item.tier) === 2;
    });
    expect(recipes.length).toBeGreaterThan(0);

    for (const recipe of recipes) {
      const item = V2_EQUIPMENT[recipe.equipmentId];
      const plan = guildWorkshopDismantlePlan(
        item,
        {
          craftedBy: {
            userId: "u1",
            profession: "blacksmith",
            level: 20,
            craftedAt: new Date(0).toISOString(),
          },
        },
        20,
      );
      expect(plan.blockedReason, recipe.id).toBeUndefined();
      expect(Object.keys(plan.materials).length, recipe.id).toBeGreaterThan(0);
    }
  });

  it("recovers half of same-tier material costs on craft-only dismantle", () => {
    const item = V2_EQUIPMENT.v2_crafted_sunforge_blade;
    const plan = guildWorkshopDismantlePlan(
      item,
      {
        craftedBy: {
          userId: "u1",
          profession: "blacksmith",
          level: 8,
          craftedAt: new Date(0).toISOString(),
        },
      },
      8,
    );
    expect(plan.materials).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 1,
    });
    expect(plan.artisanXp).toBe(2);
  });

  it("returns extra dismantle materials for craft-only quality masterworks", () => {
    const item = V2_EQUIPMENT.v2_crafted_sunforge_blade;
    const plan = guildWorkshopDismantlePlan(
      item,
      {
        craftQuality: { level: 2, bonusPct: 10 },
        craftedBy: {
          userId: "u1",
          profession: "blacksmith",
          level: 9,
          craftedAt: new Date(0).toISOString(),
          masterwork: true,
        },
      },
      9,
    );
    expect(plan.materials).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.sunstone]: 2,
    });
    expect(plan.artisanXp).toBe(2);
  });

  it("adds dismantled materials into inventory", () => {
    expect(
      addGuildWorkshopMaterials(
        { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 2 },
        {
          [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1,
          [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
        },
      ),
    ).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 3,
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 2,
    });
  });
});
