import { describe, expect, it } from "vitest";
import {
  COOKING_DAILY_ORDER_COUNT,
  COOKING_RECIPES,
  COOKING_RECIPE_BY_ID,
  COOKING_STANDING_DELIVERY_DAILY_LIMIT,
  addCookingFood,
  adjustedCookingXp,
  cookingFoodDefinition,
  cookingFoodId,
  cookingExpPct,
  cookingIngredientRequirement,
  cookingIngredientRequirementAccumulated,
  cookingXpReward,
  cookingXpRewardRange,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  cookingOrderReward,
  cookingOrders,
  cookingQuality,
  cookingRecipeMatchesQuery,
  cookingStatText,
  deliverableCookingFoods,
  recordCookingActionStats,
  cookingStatPct,
  cookingStandingDeliveryReward,
  emptyCookingState,
  parseCookingFoodInventory,
  parseCookingState,
  parseCookingStateWithLevelMigration,
  removeCookingFood,
  savedRareCookingIngredientCount,
} from "./cooking";

describe("personal cooking", () => {
  it("기존 50레벨 기준을 보존하고 100레벨 곡선으로 확장한다", () => {
    expect(cookingLevelXpThreshold(50)).toBe(24_010);
    expect(cookingLevelXpThreshold(100)).toBe(120_050);
    expect(cookingLevelForXp(cookingLevelXpThreshold(75))).toBe(75);
  });

  it("구 50레벨 초과 요리 XP를 25%만 한 번 환산한다", () => {
    const parsed = parseCookingStateWithLevelMigration({
      ...emptyCookingState(1_000),
      levelCurveVersion: undefined,
      xp: 999_999,
    });

    expect(parsed.levelCurveMigrated).toBe(true);
    expect(parsed.state.levelCurveVersion).toBe(2);
    expect(parsed.state.xp).toBe(cookingLevelXpThreshold(60));
  });

  it("요리 스탯 효과를 공용 한글 라벨로 표시하고 알 수 없는 키는 안전하게 유지한다", () => {
    expect(cookingStatText({ str: 8, vit: 5, custom: 2 })).toBe(
      "힘 +8% · 활력 +5% · CUSTOM +2%",
    );
    expect(cookingStatText({ int: 5 }, 50)).toBe(
      "지능 +5% · 사냥 경험치 +50%",
    );
  });

  it("깨달음의 허브차는 품질과 희귀 재료에 따라 사냥 경험치 버프가 강해진다", () => {
    const tea = COOKING_RECIPES.find((entry) => entry.id === "herb_tea")!;
    expect(tea.name).toBe("깨달음의 허브차");
    expect(cookingExpPct(tea, "normal", false)).toBe(60);
    expect(cookingExpPct(tea, "careful", false)).toBe(66);
    expect(cookingExpPct(tea, "masterpiece", false)).toBe(72);
    expect(cookingExpPct(tea, "careful", true)).toBe(99);

    const food = cookingFoodDefinition(
      cookingFoodId({
        recipeId: tea.id,
        quality: "normal",
        usedRare: false,
        extended: false,
      }),
    );
    expect(food).toMatchObject({ expPct: 60 });
  });

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
        [1, 7],
        [10, 7],
        [20, 8],
        [35, 8],
        [50, 15],
      ]),
    );
    expect(COOKING_RECIPES).toHaveLength(45);
  });

  it("adds ranch recipes at the intended cooking tiers", () => {
    expect(COOKING_RECIPE_BY_ID.get("country_egg_bread")).toMatchObject({
      name: "시골식 달걀빵",
      requiredLevel: 1,
      farmIngredients: { wheat: 8, egg: 4 },
      xp: 13,
      baseStatPct: { str: 5 },
    });
    expect(COOKING_RECIPE_BY_ID.get("herb_omelet")).toMatchObject({
      requiredLevel: 10,
      farmIngredients: { egg: 6, tomato: 5, herb: 3 },
      xp: 29,
      baseStatPct: { dex: 7, vit: 3 },
    });
    expect(COOKING_RECIPE_BY_ID.get("milk_potato_soup")).toMatchObject({
      requiredLevel: 20,
      farmIngredients: { milk: 6, potato: 8, onion: 4 },
      xp: 54,
      baseStatPct: { vit: 8, spi: 4 },
    });
    expect(COOKING_RECIPE_BY_ID.get("ranch_cream_gratin")).toMatchObject({
      requiredLevel: 35,
      farmIngredients: { milk: 8, egg: 6, potato: 8 },
      xp: 90,
      baseStatPct: { int: 15, vit: 7 },
    });
    const porkRecipe = COOKING_RECIPE_BY_ID.get("herb_roasted_pork");
    expect(porkRecipe).toMatchObject({
      name: "허브 돼지고기 구이",
      requiredLevel: 50,
      farmIngredients: { pork: 8, onion: 8, herb: 6 },
      xp: 130,
      baseStatPct: { str: 20, vit: 10 },
    });
    expect(cookingRecipeMatchesQuery(porkRecipe!, "돼지고기")).toBe(true);
  });

  it("expands pork, egg, and milk into six distinct ranch recipes", () => {
    const expectedRecipes = [
      {
        id: "egg_fried_rice",
        query: "달걀",
        expected: {
          name: "달걀 볶음밥",
          requiredLevel: 20,
          farmIngredients: { egg: 6, rice: 8, onion: 4 },
          xp: 54,
          baseStatPct: { dex: 8, luk: 4 },
        },
      },
      {
        id: "milk_rice_porridge",
        query: "우유",
        expected: {
          name: "우유 쌀죽",
          requiredLevel: 20,
          farmIngredients: { milk: 6, rice: 8, herb: 2 },
          xp: 52,
          baseStatPct: { spi: 8, vit: 4 },
        },
      },
      {
        id: "soy_braised_eggs",
        query: "달걀",
        expected: {
          name: "간장 달걀 조림",
          requiredLevel: 35,
          farmIngredients: { egg: 8, soybean: 6, herb: 4 },
          optionalRareItemId: "black_soybean",
          xp: 90,
          baseStatPct: { vit: 15, luk: 7 },
          specialStatPct: { vit: 18, luk: 9 },
        },
      },
      {
        id: "milk_custard_pudding",
        query: "우유",
        expected: {
          name: "우유 커스터드 푸딩",
          requiredLevel: 35,
          farmIngredients: { milk: 8, egg: 6, sugarcane: 6 },
          optionalRareItemId: "crystal_sugarcane",
          xp: 92,
          baseStatPct: { int: 15, spi: 7 },
          specialStatPct: { int: 18, spi: 9 },
        },
      },
      {
        id: "crispy_pork_cutlet",
        query: "돼지고기",
        expected: {
          name: "바삭한 돼지고기 커틀릿",
          requiredLevel: 50,
          farmIngredients: { pork: 8, wheat: 8, egg: 4, onion: 4 },
          optionalRareItemId: "golden_wheat",
          xp: 138,
          baseStatPct: { str: 20, dex: 10 },
          specialStatPct: { str: 25, dex: 12 },
        },
      },
      {
        id: "soy_pork_rice_bowl",
        query: "돼지고기",
        expected: {
          name: "간장 돼지고기 덮밥",
          requiredLevel: 50,
          farmIngredients: { pork: 8, rice: 12, soybean: 6, onion: 4 },
          optionalRareItemId: "black_soybean",
          xp: 140,
          baseStatPct: { vit: 20, str: 10 },
          specialStatPct: { vit: 25, str: 12 },
        },
      },
    ] as const;

    for (const entry of expectedRecipes) {
      const recipe = COOKING_RECIPE_BY_ID.get(entry.id);
      expect(recipe, entry.id).toMatchObject(entry.expected);
      expect(cookingRecipeMatchesQuery(recipe!, entry.query), entry.id).toBe(
        true,
      );
    }
  });

  it("adds six more ranch recipes with the agreed ingredients and effects", () => {
    const expectedRecipes = [
      {
        id: "egg_salad_sandwich",
        query: "달걀",
        expected: {
          name: "달걀 샐러드 샌드위치",
          requiredLevel: 10,
          farmIngredients: { egg: 6, wheat: 8, tomato: 4 },
          optionalRareItemId: "golden_wheat",
          xp: 30,
          baseStatPct: { vit: 7, luk: 3 },
          specialStatPct: { vit: 10, luk: 5 },
        },
      },
      {
        id: "corn_milk_chowder",
        query: "우유",
        expected: {
          name: "옥수수 우유 차우더",
          requiredLevel: 20,
          farmIngredients: { milk: 6, corn: 8, onion: 4 },
          optionalRareItemId: "sweet_corn",
          xp: 56,
          baseStatPct: { int: 8, vit: 4 },
          specialStatPct: { int: 11, vit: 6 },
        },
      },
      {
        id: "strawberry_milk_parfait",
        query: "우유",
        expected: {
          name: "딸기 우유 파르페",
          requiredLevel: 35,
          farmIngredients: { milk: 8, strawberry: 8, sugarcane: 6 },
          optionalRareItemId: "white_strawberry",
          xp: 92,
          baseStatPct: { luk: 15, spi: 7 },
          specialStatPct: { luk: 18, spi: 9 },
        },
      },
      {
        id: "spicy_pork_stew",
        query: "돼지고기",
        expected: {
          name: "매콤한 돼지고기 스튜",
          requiredLevel: 50,
          farmIngredients: { pork: 8, tomato: 12, onion: 6, herb: 4 },
          optionalRareItemId: "heirloom_tomato",
          xp: 145,
          baseStatPct: { int: 20, vit: 10 },
          specialStatPct: { int: 25, vit: 12 },
        },
      },
      {
        id: "royal_pork_pie",
        query: "돼지고기",
        expected: {
          name: "왕실 돼지고기 파이",
          requiredLevel: 50,
          farmIngredients: { pork: 8, wheat: 10, egg: 4, onion: 4 },
          optionalRareItemId: "golden_wheat",
          xp: 145,
          baseStatPct: { luk: 20, dex: 10 },
          specialStatPct: { luk: 25, dex: 12 },
        },
      },
      {
        id: "ranch_grand_feast",
        query: "우유",
        expected: {
          name: "목장 대만찬",
          requiredLevel: 50,
          farmIngredients: { pork: 8, egg: 8, milk: 8, wheat: 8 },
          xp: 160,
          baseStatPct: {
            str: 10,
            vit: 10,
            dex: 10,
            int: 10,
            spi: 10,
            luk: 10,
          },
        },
      },
    ] as const;

    for (const entry of expectedRecipes) {
      const recipe = COOKING_RECIPE_BY_ID.get(entry.id);
      expect(recipe, entry.id).toMatchObject(entry.expected);
      expect(cookingRecipeMatchesQuery(recipe!, entry.query), entry.id).toBe(
        true,
      );
    }
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
    expect(cookingLevelForXp(Number.MAX_SAFE_INTEGER)).toBe(100);
  });

  it("reduces XP from recipes far below the cook level", () => {
    expect(adjustedCookingXp(1, 5, 100)).toBe(100);
    expect(adjustedCookingXp(1, 11, 100)).toBe(25);
    expect(adjustedCookingXp(1, 21, 100)).toBe(5);
  });

  it("rotates six deterministic daily orders", () => {
    const state = { ...emptyCookingState(0), xp: cookingLevelXpThreshold(50) };
    expect(cookingOrders("user-a", state)).toHaveLength(6);
    expect(cookingOrders("user-a", state)).toEqual(cookingOrders("user-a", state));
  });

  it("keeps all six daily orders distinct at every unlock tier", () => {
    for (const level of [1, 10, 20, 35, 50]) {
      const state = {
        ...emptyCookingState(0),
        xp: cookingLevelXpThreshold(level),
      };
      const orders = cookingOrders("user-a", state);
      expect(orders).toHaveLength(COOKING_DAILY_ORDER_COUNT);
      expect(new Set(orders.map((order) => order.recipeId)).size).toBe(6);
    }
  });

  it("keeps the existing first three preferred slots when they are unique", () => {
    const expectedByLevel = new Map([
      [1, ["country_egg_bread", "fish_skewer", "herb_tea"]],
      [10, ["country_egg_bread", "corn_tomato_potage", "herb_tea"]],
      [20, ["egg_salad_sandwich", "milk_potato_soup", "herb_tea"]],
      [35, ["fresh_fish_soup", "potato_stew", "egg_fried_rice"]],
      [50, ["soy_glazed_fish_bowl", "strawberry_milk_parfait", "spicy_pork_stew"]],
    ]);

    for (const [level, expected] of expectedByLevel) {
      const state = {
        ...emptyCookingState(0),
        xp: cookingLevelXpThreshold(level),
      };
      expect(
        cookingOrders("user-a", state)
          .slice(0, 3)
          .map((order) => order.recipeId),
      ).toEqual(expected);
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

  it("normalizes standing deliveries within the same day and resets them tomorrow", () => {
    const sameDay = parseCookingState(
      {
        daily: {
          dayKey: "1970-01-01",
          surplusTrades: 0,
          completedOrderIds: Array.from(
            { length: 9 },
            (_, index) => `1970-01-01:${index}`,
          ),
          standingDeliveries: 99,
        },
      },
      0,
    );

    expect(sameDay.daily.completedOrderIds).toHaveLength(
      COOKING_DAILY_ORDER_COUNT,
    );
    expect(sameDay.daily.standingDeliveries).toBe(
      COOKING_STANDING_DELIVERY_DAILY_LIMIT,
    );
    expect(
      parseCookingState(
        { daily: { dayKey: "old", standingDeliveries: 8 } },
        0,
      ).daily.standingDeliveries,
    ).toBe(0);
  });

  it("재료 절약 나머지는 날짜가 바뀌어도 안전한 값만 보존한다", () => {
    const parsed = parseCookingState(
      {
        daily: { dayKey: "old" },
        ingredientReductionRemainderBps: {
          "farm:wheat": 5_700,
          "fishing:catch_common": 20_000,
          invalid: -1,
        },
      },
      0,
    );

    expect(parsed.ingredientReductionRemainderBps).toEqual({
      "farm:wheat": 5_700,
      "fishing:catch_common": 9_999,
    });
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
    const first = cookingIngredientRequirementAccumulated({
      countPerDish: 3,
      quantity: 1,
      cookingJobTier: 4,
      materialReductionPct: 10,
    });
    const second = cookingIngredientRequirementAccumulated({
      countPerDish: 3,
      quantity: 1,
      cookingJobTier: 4,
      materialReductionPct: 10,
      reductionRemainderBps: first.remainderBps,
    });
    expect([first.required, second.required]).toEqual([3, 2]);
    expect(second.remainderBps).toBe(1_400);
    const rolls = [0.1, 0.3, 0.2, 0.9];
    expect(
      savedRareCookingIngredientCount({
        quantity: 4,
        saveChancePct: 25,
        rng: () => rolls.shift() ?? 1,
      }),
    ).toBe(2);
  });

  it("작은 요리 경험치 보너스의 소수 부분도 확률적으로 지급한다", () => {
    expect(
      cookingXpReward({ baseXp: 12, bonusPct: 15, rng: () => 0.79 }),
    ).toBe(14);
    expect(
      cookingXpReward({ baseXp: 12, bonusPct: 15, rng: () => 0.8 }),
    ).toBe(13);
  });

  it("요리 경험치 미리보기는 실제 지급 가능한 최솟값과 최댓값을 반환한다", () => {
    expect(cookingXpRewardRange({ baseXp: 12 })).toEqual({
      min: 12,
      max: 12,
    });
    expect(cookingXpRewardRange({ baseXp: 12, bonusPct: 25 })).toEqual({
      min: 15,
      max: 15,
    });
    expect(cookingXpRewardRange({ baseXp: 12, bonusPct: 15 })).toEqual({
      min: 13,
      max: 14,
    });
    expect(cookingXpRewardRange({ baseXp: -3, bonusPct: -10 })).toEqual({
      min: 1,
      max: 1,
    });
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

  it("pays twenty percent of premium order gold for standing deliveries", () => {
    const recipes = [
      ["rustic_bread", 10_000],
      ["tomato_salad", 20_000],
      ["potato_stew", 30_000],
      ["soybean_rice", 40_000],
      ["flame_corn_stew", 50_000],
    ] as const;

    for (const [recipeId, unitGold] of recipes) {
      expect(
        cookingStandingDeliveryReward(
          COOKING_RECIPE_BY_ID.get(recipeId)!,
          "normal",
          1,
        ),
      ).toEqual({ unitGold, totalGold: unitGold, qualityBonusPct: 0 });
    }

    const level50 = COOKING_RECIPE_BY_ID.get("flame_corn_stew")!;
    expect(cookingStandingDeliveryReward(level50, "normal", 3)).toEqual({
      unitGold: 50_000,
      totalGold: 150_000,
      qualityBonusPct: 0,
    });
    expect(
      cookingStandingDeliveryReward(level50, "careful", 2),
    ).toEqual({
      unitGold: 60_000,
      totalGold: 120_000,
      qualityBonusPct: 20,
    });
    expect(
      cookingStandingDeliveryReward(level50, "masterpiece", 2),
    ).toEqual({
      unitGold: 75_000,
      totalGold: 150_000,
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
