import { describe, expect, it } from "vitest";
import {
  COOKING_RECIPES,
  addCookingFood,
  adjustedCookingXp,
  cookingFoodDefinition,
  cookingFoodId,
  cookingIngredientRequirement,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  cookingOrderReward,
  cookingOrders,
  cookingQuality,
  cookingRecipeMatchesQuery,
  deliverableCookingFoods,
  recordCookingActionStats,
  cookingStatPct,
  emptyCookingState,
  parseCookingFoodInventory,
  parseCookingState,
  removeCookingFood,
  savedRareCookingIngredientCount,
} from "./cooking";

describe("personal cooking", () => {
  it("maps every recipe to its own cooking image asset", () => {
    const paths = COOKING_RECIPES.map((recipe) => recipe.imageSrc);
    expect(paths).toEqual(
      COOKING_RECIPES.map(
        (recipe) => `/images/items/cooking/${recipe.id}.webp`,
      ),
    );
    expect(new Set(paths).size).toBe(COOKING_RECIPES.length);
  });

  it("uses both farm crops and every fishing stock grade", () => {
    expect(COOKING_RECIPES.some((recipe) => Object.keys(recipe.farmIngredients).length > 0)).toBe(true);
    const fishIds = new Set(COOKING_RECIPES.flatMap((recipe) => Object.keys(recipe.fishingIngredients ?? {})));
    expect(fishIds).toEqual(new Set([
      "catch_common",
      "catch_fresh",
      "catch_quality",
      "catch_special",
      "catch_legendary",
    ]));
  });

  it("offers several distinct choices at every cooking progression tier", () => {
    const recipeCounts = new Map<number, number>();
    for (const recipe of COOKING_RECIPES) {
      recipeCounts.set(
        recipe.requiredLevel,
        (recipeCounts.get(recipe.requiredLevel) ?? 0) + 1,
      );
    }
    expect(recipeCounts).toEqual(
      new Map([
        [1, 6],
        [10, 5],
        [20, 4],
        [35, 4],
        [50, 9],
      ]),
    );
  });

  it("uses the previously underused pearl onion and crystal sugarcane specials", () => {
    expect(
      COOKING_RECIPES.some(
        (recipe) => recipe.optionalRareItemId === "pearl_onion",
      ),
    ).toBe(true);
    expect(
      COOKING_RECIPES.some(
        (recipe) => recipe.optionalRareItemId === "crystal_sugarcane",
      ),
    ).toBe(true);
  });

  it("has high-impact final recipes and rare upgrades", () => {
    const finals = COOKING_RECIPES.filter((recipe) => recipe.requiredLevel === 50);
    expect(finals.length).toBeGreaterThanOrEqual(7);
    expect(finals.some((recipe) => Object.values(recipe.baseStatPct).some((value) => (value ?? 0) >= 20))).toBe(true);
    expect(finals.some((recipe) => Object.values(recipe.specialStatPct ?? {}).some((value) => (value ?? 0) >= 20))).toBe(true);
  });

  it("derives level thresholds through level 50", () => {
    expect(cookingLevelForXp(0)).toBe(1);
    expect(cookingLevelForXp(cookingLevelXpThreshold(20))).toBe(20);
    expect(cookingLevelForXp(Number.MAX_SAFE_INTEGER)).toBe(50);
  });

  it("reduces XP from recipes far below the cook level", () => {
    expect(adjustedCookingXp(1, 5, 100)).toBe(100);
    expect(adjustedCookingXp(1, 11, 100)).toBe(25);
    expect(adjustedCookingXp(1, 21, 100)).toBe(5);
  });

  it("rotates three deterministic daily orders", () => {
    const state = { ...emptyCookingState(0), xp: cookingLevelXpThreshold(50) };
    expect(cookingOrders("user-a", state)).toHaveLength(3);
    expect(cookingOrders("user-a", state)).toEqual(cookingOrders("user-a", state));
  });

  it("keeps all three daily orders distinct at every unlock tier", () => {
    for (const level of [1, 10, 20, 35, 50]) {
      const state = {
        ...emptyCookingState(0),
        xp: cookingLevelXpThreshold(level),
      };
      const orders = cookingOrders("user-a", state);
      expect(new Set(orders.map((order) => order.recipeId)).size).toBe(3);
    }
  });

  it("normalizes daily state and known recipe ids", () => {
    const parsed = parseCookingState({
      xp: 25,
      discoveredRecipeIds: ["rustic_bread", "unknown"],
      favoriteRecipeIds: ["fish_skewer", "unknown"],
      stats: {
        dishesCooked: 12.8,
        ordersCompleted: 4,
        masterpiecesCooked: -2,
        rareIngredientDishes: 3,
      },
      daily: { dayKey: "old", surplusTrades: 99, completedOrderIds: ["old"] },
    }, 0);
    expect(parsed.discoveredRecipeIds).toEqual(["rustic_bread"]);
    expect(parsed.favoriteRecipeIds).toEqual(["fish_skewer"]);
    expect(parsed.stats).toEqual({
      dishesCooked: 12,
      ordersCompleted: 4,
      masterpiecesCooked: 0,
      rareIngredientDishes: 3,
    });
    expect(parsed.daily.surplusTrades).toBe(0);
  });

  it("chef quality and rare ingredients improve a food buff", () => {
    const recipe = COOKING_RECIPES.find((entry) => entry.id === "flame_corn_stew")!;
    expect(cookingQuality({ cookingJobTier: 6, usedRare: true, rng: () => 0.99 })).toBe("masterpiece");
    expect(cookingStatPct(recipe, "masterpiece", true)).toMatchObject({ str: 24, vit: 12 });
  });

  it("tracks cooked dishes, orders, masterpieces, and rare-ingredient dishes", () => {
    const state = emptyCookingState(0);
    const cooked = recordCookingActionStats(state, {
      action: "cook",
      quantity: 5,
      quality: "masterpiece",
      usedRare: true,
    });
    const ordered = recordCookingActionStats(
      { ...state, stats: cooked },
      {
        action: "order",
        quantity: 1,
        quality: "normal",
        usedRare: false,
      },
    );

    expect(ordered).toEqual({
      dishesCooked: 5,
      ordersCompleted: 1,
      masterpiecesCooked: 5,
      rareIngredientDishes: 5,
    });
  });

  it("equipped cooking skills improve careful and masterpiece rolls", () => {
    expect(cookingQuality({ cookingJobTier: 2, rng: () => 0.2 })).toBe(
      "normal",
    );
    expect(
      cookingQuality({
        cookingJobTier: 2,
        carefulBonusPct: 8,
        rng: () => 0.2,
      }),
    ).toBe("careful");
    expect(cookingQuality({ cookingJobTier: 3, rng: () => 0.05 })).toBe(
      "careful",
    );
    expect(
      cookingQuality({
        cookingJobTier: 3,
        masterpieceBonusPct: 5,
        rng: () => 0.05,
      }),
    ).toBe("masterpiece");
  });

  it("reduces bundled ingredients and preserves rare ingredients", () => {
    expect(
      cookingIngredientRequirement({
        countPerDish: 10,
        quantity: 5,
        cookingJobTier: 4,
        materialReductionPct: 10,
      }),
    ).toBe(41);
    expect(
      cookingIngredientRequirement({
        countPerDish: 1,
        quantity: 10,
        materialReductionPct: 10,
      }),
    ).toBe(9);
    const rolls = [0.1, 0.3, 0.2, 0.9];
    expect(
      savedRareCookingIngredientCount({
        quantity: 4,
        saveChancePct: 25,
        rng: () => rolls.shift() ?? 1,
      }),
    ).toBe(2);
  });

  it("preserves crafted quality, rare ingredients, and chef duration in the food item id", () => {
    const itemId = cookingFoodId({
      recipeId: "flame_corn_stew",
      quality: "masterpiece",
      usedRare: true,
      extended: true,
    });
    const food = cookingFoodDefinition(itemId);

    expect(food).toMatchObject({
      id: itemId,
      recipeId: "flame_corn_stew",
      quality: "masterpiece",
      usedRare: true,
      extended: true,
      statPct: { str: 24, vit: 12 },
    });
    expect(food?.durationMs).toBe(5 * 60 * 60 * 1000);
  });

  it("normalizes, stacks, and consumes cooking food inventory", () => {
    const itemId = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "normal",
      usedRare: false,
      extended: false,
    });
    expect(
      parseCookingFoodInventory({
        [itemId]: 2.9,
        "food:unknown:normal:base:standard": 10,
        invalid: 5,
      }),
    ).toEqual({ [itemId]: 2 });
    expect(addCookingFood({ [itemId]: 2 }, itemId, 3)).toEqual({
      [itemId]: 5,
    });
    expect(removeCookingFood({ [itemId]: 2 }, itemId, 1)).toEqual({
      [itemId]: 1,
    });
    expect(removeCookingFood({ [itemId]: 1 }, itemId, 1)).toEqual({});
    expect(removeCookingFood({}, itemId, 1)).toBeNull();
  });

  it("finds held foods for an order and prioritizes higher quality", () => {
    const normal = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "normal",
      usedRare: false,
      extended: false,
    });
    const masterpiece = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "masterpiece",
      usedRare: true,
      extended: true,
    });
    const otherRecipe = cookingFoodId({
      recipeId: "herb_tea",
      quality: "masterpiece",
      usedRare: true,
      extended: true,
    });

    expect(
      deliverableCookingFoods(
        { [normal]: 2, [masterpiece]: 1, [otherRecipe]: 5 },
        "rustic_bread",
      ).map(({ food, count }) => ({ id: food.id, count })),
    ).toEqual([
      { id: masterpiece, count: 1 },
      { id: normal, count: 2 },
    ]);
  });

  it("scales order rewards by delivered food quality", () => {
    const order = {
      id: "order-1",
      recipeId: "rustic_bread",
      rewardGold: 50_000,
      rewardReputation: 1,
      bonusXp: 12,
    };

    expect(cookingOrderReward(order, "normal")).toMatchObject({
      gold: 50_000,
      reputation: 1,
      bonusXp: 12,
      qualityBonusPct: 0,
    });
    expect(cookingOrderReward(order, "careful")).toMatchObject({
      gold: 60_000,
      reputation: 2,
      bonusXp: 14,
      qualityBonusPct: 20,
    });
    expect(cookingOrderReward(order, "masterpiece")).toMatchObject({
      gold: 75_000,
      reputation: 3,
      bonusXp: 18,
      qualityBonusPct: 50,
    });
  });

  it("matches recipe searches against dish and ingredient names", () => {
    const recipe = COOKING_RECIPES.find(
      (entry) => entry.id === "fish_croquettes",
    )!;

    expect(cookingRecipeMatchesQuery(recipe, "크로켓")).toBe(true);
    expect(cookingRecipeMatchesQuery(recipe, "감자 양파")).toBe(true);
    expect(cookingRecipeMatchesQuery(recipe, "고급 어획물")).toBe(true);
    expect(cookingRecipeMatchesQuery(recipe, "토마토")).toBe(false);
  });
});
