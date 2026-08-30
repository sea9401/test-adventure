import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  COOKING_SECRET_RECIPES,
  COOKING_SECRET_RECIPE_BY_ID,
  canonicalCookingCombination,
  findSecretRecipe,
  validateCookingRecipeCatalog,
} from "./recipes";
import {
  COOKING_PUBLIC_RECIPES,
  EXPANSION_COOKING_RECIPE_IDS,
  SIMPLE_COOKING_RECIPE_IDS,
} from "@/adventure/v2/cooking/catalog";
import { COOKING_METHOD_UNLOCK_LEVEL } from "@/adventure/v2/cooking/types";
import {
  canonicalCookingEffect,
  effectForCookingExpansion,
} from "@/adventure/v2/cooking/expansion/effects";
import {
  COOKING_EXPANSION_BATCHES,
  COOKING_EXPANSION_ROWS,
} from "@/adventure/v2/cooking/expansion";
import { COOKING_EXPANSION_ANSWERS } from "./expansion";

const SIMPLE_RECIPES = [
  ["fried_egg", "소금 간 계란후라이", "hearth", "fry", 1],
  ["boiled_egg", "소금 삶은 달걀", "pot", "boil", 1],
  ["grilled_potato", "소금 감자구이", "hearth", "grill", 1],
  ["buttered_corn", "버터 옥수수구이", "hearth", "grill", 1],
  ["simple_tomato_soup", "소박한 토마토 수프", "pot", "boil", 1],
  ["milk_bread", "부드러운 우유빵", "baking", "bake", 1],
  ["sugar_cookie", "바삭한 설탕 쿠키", "baking", "bake", 1],
  ["strawberry_jam", "달콤한 딸기잼", "baking", "boil", 1],
  ["campfire_fish", "모닥불 생선구이", "seafood", "grill", 1],
  ["simple_fish_soup", "소박한 생선국", "seafood", "boil", 1],
  ["strawberry_milk", "딸기 우유", "medicinal", "brew", 1],
  ["hot_cacao", "따뜻한 카카오", "medicinal", "brew", 1],
  ["tomato_egg_stir_fry", "토마토 달걀볶음", "hearth", "stir_fry", 2],
  ["potato_fries", "짭짤한 감자튀김", "hearth", "fry", 2],
  ["herb_egg_soup", "허브 달걀국", "pot", "boil", 2],
  ["corn_cream_soup", "고소한 옥수수 수프", "pot", "boil", 2],
  ["cacao_cookie", "카카오 쿠키", "baking", "bake", 2],
  ["fish_fry", "바삭한 생선튀김", "seafood", "fry", 2],
  ["steamed_fish", "담백한 생선찜", "seafood", "steam", 2],
  ["herb_pickles", "새콤한 허브 절임", "medicinal", "ferment", 2],
] as const;

const SIMPLE_ANSWERS = [
  ["fried_egg", "fry", ["farm:egg", "pantry:salt"]],
  ["boiled_egg", "boil", ["farm:egg", "pantry:salt"]],
  ["grilled_potato", "grill", ["farm:potato", "pantry:salt"]],
  ["buttered_corn", "grill", ["farm:corn", "processed:butter"]],
  ["simple_tomato_soup", "boil", ["farm:tomato", "processed:broth"]],
  ["milk_bread", "bake", ["farm:wheat", "farm:milk"]],
  ["sugar_cookie", "bake", ["farm:wheat", "farm:sugarcane"]],
  ["strawberry_jam", "boil", ["farm:strawberry", "farm:sugarcane"]],
  ["campfire_fish", "grill", ["fishing:catch_common", "pantry:salt"]],
  ["simple_fish_soup", "boil", ["fishing:catch_common", "processed:broth"]],
  ["strawberry_milk", "brew", ["farm:strawberry", "farm:milk"]],
  ["hot_cacao", "brew", ["farm:cacao", "farm:milk"]],
  ["tomato_egg_stir_fry", "stir_fry", ["farm:tomato", "farm:egg", "pantry:oil"]],
  ["potato_fries", "fry", ["farm:potato", "pantry:oil", "pantry:salt"]],
  ["herb_egg_soup", "boil", ["farm:egg", "farm:herb", "pantry:salt"]],
  ["corn_cream_soup", "boil", ["farm:corn", "farm:milk", "pantry:salt"]],
  ["cacao_cookie", "bake", ["farm:wheat", "farm:cacao", "farm:sugarcane"]],
  ["fish_fry", "fry", ["fishing:catch_common", "processed:flour", "pantry:oil"]],
  ["steamed_fish", "steam", ["fishing:catch_fresh", "farm:onion", "pantry:salt"]],
  ["herb_pickles", "ferment", ["farm:herb", "pantry:vinegar", "pantry:salt"]],
] as const;

const NATURALIZED_LEGACY_RECIPES = [
  ["herb_omelet", ["farm:egg", "farm:herb", "processed:butter"]],
  [
    "crispy_pork_cutlet",
    ["farm:pork", "farm:egg", "processed:flour", "pantry:oil"],
  ],
  [
    "golden_corn_fritters",
    ["farm:corn", "farm:egg", "processed:flour", "pantry:oil", "pantry:salt"],
  ],
  [
    "harvest_stir_fry",
    ["farm:corn", "farm:tomato", "farm:onion", "farm:herb", "pantry:oil"],
  ],
  [
    "moonlit_cutlet",
    ["farm:pork", "farm:egg", "processed:flour", "pantry:oil", "farm:herb"],
  ],
  [
    "spicy_pork_stew",
    ["farm:pork", "farm:potato", "farm:onion", "processed:broth", "pantry:spice"],
  ],
  ["strawberry_tart", ["farm:strawberry", "farm:wheat", "processed:butter"]],
  [
    "strawberry_milk_parfait",
    ["farm:strawberry", "farm:milk", "processed:cream", "farm:sugarcane"],
  ],
  [
    "golden_gratin",
    ["farm:golden_potato", "farm:onion", "processed:cream", "processed:cheese"],
  ],
  [
    "white_strawberry_dessert",
    [
      "farm:white_strawberry",
      "farm:strawberry",
      "processed:cream",
      "farm:sugarcane",
      "farm:milk",
    ],
  ],
  [
    "fish_croquettes",
    ["fishing:catch_quality", "farm:potato", "processed:flour"],
  ],
  [
    "aromatic_fish_curry",
    ["fishing:catch_quality", "farm:rice", "processed:broth", "pantry:spice"],
  ],
  [
    "golden_seafood_paella",
    [
      "fishing:catch_special",
      "farm:rice",
      "farm:tomato",
      "farm:onion",
      "pantry:spice",
    ],
  ],
  [
    "sunset_fish_chowder",
    [
      "fishing:catch_quality",
      "farm:potato",
      "farm:milk",
      "processed:cream",
      "farm:onion",
    ],
  ],
  [
    "storm_seafood_fry",
    [
      "fishing:catch_special",
      "fishing:catch_legendary",
      "processed:flour",
      "pantry:oil",
      "farm:onion",
    ],
  ],
  [
    "moon_tide_sashimi",
    [
      "fishing:catch_quality",
      "fishing:catch_special",
      "pantry:vinegar",
      "pantry:salt",
      "farm:onion",
    ],
  ],
  [
    "crystal_cacao_drink",
    ["farm:cacao", "farm:crystal_sugarcane", "farm:milk"],
  ],
  [
    "restorative_herb_porridge",
    ["farm:rice", "farm:herb", "processed:broth", "farm:silverleaf", "farm:soybean"],
  ],
  [
    "ocean_emperors_table",
    [
      "fishing:catch_legendary",
      "fishing:catch_special",
      "farm:rice",
      "farm:herb",
      "processed:sauce",
    ],
  ],
  [
    "midnight_cacao_banquet",
    ["farm:cacao", "farm:royal_cacao", "farm:milk", "processed:cream", "farm:sugarcane"],
  ],
] as const;

const EXPANSION_BATCH_01 = [
  ["pepper_pork_grill", "후추 돼지고기구이", "hearth", "grill", 1, ["farm:pork", "pantry:pepper"]],
  ["tomato_cheese_skillet", "토마토 치즈 철판볶음", "hearth", "stir_fry", 2, ["farm:tomato", "processed:cheese", "pantry:oil"]],
  ["butter_potato_mash", "버터 감자 으깸", "pot", "boil", 1, ["farm:potato", "processed:butter"]],
  ["pork_onion_broth", "돼지고기 양파탕", "pot", "boil", 3, ["farm:pork", "farm:onion", "processed:broth", "pantry:pepper"]],
  ["butter_toast", "고소한 버터 토스트", "baking", "bake", 1, ["processed:flour", "processed:butter"]],
  ["strawberry_cream_cake", "딸기 생크림 케이크", "baking", "bake", 3, ["farm:strawberry", "processed:flour", "processed:cream", "farm:sugarcane"]],
  ["pepper_fresh_fish", "후추 생선구이", "seafood", "grill", 1, ["fishing:catch_fresh", "pantry:pepper"]],
  ["vinegar_cured_fish", "새콤한 숙성 생선", "seafood", "ferment", 2, ["fishing:catch_fresh", "pantry:vinegar", "farm:onion"]],
  ["soybean_herb_tea", "콩 허브차", "medicinal", "brew", 2, ["farm:soybean", "farm:herb", "farm:sugarcane"]],
  ["silverleaf_crystal_tonic", "은빛 수정 강장차", "medicinal", "brew", 4, ["farm:silverleaf", "farm:crystal_sugarcane", "farm:herb", "farm:royal_cacao", "pantry:spice"]],
] as const;

const NAMED_RARE_INGREDIENTS = [
  ["황금 밀", "farm:golden_wheat"],
  ["은빛잎", "farm:silverleaf"],
  ["달콤 옥수수", "farm:sweet_corn"],
  ["고대종 토마토", "farm:heirloom_tomato"],
  ["설향 딸기", "farm:white_strawberry"],
  ["황금 감자", "farm:golden_potato"],
  ["진주 양파", "farm:pearl_onion"],
  ["황금 쌀", "farm:golden_rice"],
  ["검은콩", "farm:black_soybean"],
  ["수정 사탕수수", "farm:crystal_sugarcane"],
  ["왕실 카카오", "farm:royal_cacao"],
] as const;

const NAMED_COMMON_INGREDIENTS = [
  ["우유", "farm:milk"],
  ["버터", "processed:butter"],
  ["소금", "pantry:salt"],
] as const;

const NAMED_RECIPE_BASES = [
  ["숙성크림", ["processed:cream"]],
  ["빵", ["farm:wheat", "farm:golden_wheat", "processed:flour"]],
  ["소스볶음", ["processed:sauce"]],
  ["육수", ["processed:broth"]],
] as const;

describe("hidden cooking recipe catalog", () => {
  it("publishes expansion batches 01 through 38 as complete ten-recipe units", () => {
    expect(COOKING_EXPANSION_BATCHES.map((batch) => batch.id)).toEqual(
      Array.from({ length: 38 }, (_, index) => String(index + 1).padStart(2, "0")),
    );
    expect(COOKING_EXPANSION_ROWS).toHaveLength(380);
    expect(COOKING_EXPANSION_ANSWERS).toHaveLength(380);
    expect(COOKING_EXPANSION_BATCHES.every((batch) => batch.rows.length === 10)).toBe(true);
    expect(COOKING_EXPANSION_ROWS.slice(0, 10).map((row) => row[0])).toEqual(
      EXPANSION_BATCH_01.map(([id]) => id),
    );
    expect(
      COOKING_EXPANSION_ROWS.reduce<Record<number, number>>((counts, row) => {
        counts[row[5]] = (counts[row[5]] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ 1: 160, 2: 120, 3: 60, 4: 30, 5: 10 });
  });

  it("reserves 380 distinct three-part effects for the planned expansion", () => {
    const tierCounts = [
      [1, 160],
      [2, 120],
      [3, 60],
      [4, 30],
      [5, 10],
    ] as const;
    const fields = ["hearth", "pot", "baking", "seafood", "medicinal"] as const;
    const groupOccurrences = new Map<string, number>();
    const expansionEffects = tierCounts.flatMap(([tier, count]) =>
      Array.from({ length: count }, (_, index) => {
        const field = fields[index % fields.length];
        const group = `${field}:${tier}`;
        const occurrence = groupOccurrences.get(group) ?? 0;
        groupOccurrences.set(group, occurrence + 1);
        return effectForCookingExpansion(field, tier, occurrence).effect;
      }),
    );
    const existingEffects = new Set(
      COOKING_PUBLIC_RECIPES
        .filter((recipe) => !EXPANSION_COOKING_RECIPE_IDS.includes(recipe.id))
        .map((recipe) => canonicalCookingEffect(recipe.effect)),
    );

    expect(expansionEffects).toHaveLength(380);
    expect(new Set(expansionEffects.map(canonicalCookingEffect)).size).toBe(380);
    expect(
      expansionEffects.every((effect) =>
        canonicalCookingEffect(effect).split("|").length === 3,
      ),
    ).toBe(true);
    expect(
      expansionEffects.some((effect) =>
        existingEffects.has(canonicalCookingEffect(effect)),
      ),
    ).toBe(false);
  });

  it("defines six basic and four hundred ninety-four discoverable recipes with unique answers", () => {
    const answers = COOKING_SECRET_RECIPES.map((entry) =>
      canonicalCookingCombination(
        entry.method,
        entry.ingredients.map((ingredient) => ingredient.id),
      ),
    );

    expect(COOKING_SECRET_RECIPES).toHaveLength(500);
    expect(
      COOKING_SECRET_RECIPES.filter((entry) => entry.discovery === "basic"),
    ).toHaveLength(6);
    const answerOwners = new Map<string | null, string>();
    const duplicateAnswers = COOKING_SECRET_RECIPES.flatMap((recipe, index) => {
      const answer = answers[index];
      const owner = answerOwners.get(answer);
      answerOwners.set(answer, recipe.id);
      return owner ? [`${owner}:${recipe.id}`] : [];
    });
    expect(duplicateAnswers).toEqual([]);
    expect(validateCookingRecipeCatalog()).toEqual([]);
  });

  it("places twenty intuitive simple recipes immediately after the basics", () => {
    expect(COOKING_PUBLIC_RECIPES).toHaveLength(500);
    expect(
      COOKING_PUBLIC_RECIPES.slice(6, 26).map((recipe) => [
        recipe.id,
        recipe.name,
        recipe.field,
        recipe.method,
        recipe.tier,
      ]),
    ).toEqual(SIMPLE_RECIPES);
    expect(SIMPLE_COOKING_RECIPE_IDS).toEqual(
      SIMPLE_RECIPES.map(([id]) => id),
    );
  });

  it("uses the explicitly authored answers for all simple recipes", () => {
    for (const [id, method, ingredientIds] of SIMPLE_ANSWERS) {
      const recipe = COOKING_SECRET_RECIPES.find((entry) => entry.id === id);

      expect(recipe?.method).toBe(method);
      expect(recipe?.ingredients.map((ingredient) => ingredient.id).sort()).toEqual(
        [...ingredientIds].sort(),
      );
      expect(findSecretRecipe(method, [...ingredientIds].reverse())?.id).toBe(id);
    }
  });

  it("카카오 수플레는 카카오·달걀·우유 중심의 제과 재료로 만든다", () => {
    expect(COOKING_SECRET_RECIPE_BY_ID.get("cacao_souffle")?.ingredients).toEqual([
      { id: "farm:cacao", count: 6 },
      { id: "farm:egg", count: 6 },
      { id: "farm:milk", count: 6 },
      { id: "farm:sugarcane", count: 6 },
      { id: "processed:butter", count: 2 },
    ]);
  });

  it("부자연스러운 기존 자동 조합 20개를 요리 이름에 맞는 재료로 고정한다", () => {
    for (const [id, ingredients] of NATURALIZED_LEGACY_RECIPES) {
      expect(
        COOKING_SECRET_RECIPE_BY_ID.get(id)?.ingredients.map((entry) => entry.id),
        id,
      ).toEqual(ingredients);
    }
  });

  it("이름에 명시된 희귀 작물을 실제 재료로 사용한다", () => {
    const missing = COOKING_SECRET_RECIPES.flatMap((recipe) => {
      const actual = recipe.ingredients.map((ingredient) => ingredient.id);
      return NAMED_RARE_INGREDIENTS.flatMap(
        ([ingredientName, ingredientId]) =>
          recipe.name.includes(ingredientName) && !actual.includes(ingredientId)
            ? [`${recipe.id}:${ingredientId}:${actual.join(",")}`]
            : [],
      );
    });

    expect(missing).toEqual([]);
  });

  it("이름에 명시된 우유·버터·소금을 실제 재료로 사용한다", () => {
    const missing = COOKING_SECRET_RECIPES.flatMap((recipe) => {
      const actual = recipe.ingredients.map((ingredient) => ingredient.id);
      return NAMED_COMMON_INGREDIENTS.flatMap(
        ([ingredientName, ingredientId]) =>
          recipe.name.includes(ingredientName) && !actual.includes(ingredientId)
            ? [`${recipe.id}:${ingredientId}:${actual.join(",")}`]
            : [],
      );
    });

    expect(missing).toEqual([]);
  });

  it("요리 형태에 명시된 크림·빵·소스·육수를 실제 재료로 사용한다", () => {
    const missing = COOKING_SECRET_RECIPES.flatMap((recipe) => {
      const actual = recipe.ingredients.map((ingredient) => ingredient.id);
      return NAMED_RECIPE_BASES.flatMap(([nameSuffix, acceptedIngredientIds]) =>
        recipe.name.endsWith(nameSuffix) &&
        !acceptedIngredientIds.some((ingredientId) => actual.includes(ingredientId))
          ? [`${recipe.id}:${nameSuffix}:${actual.join(",")}`]
          : [],
      );
    });

    expect(missing).toEqual([]);
  });

  it("uses the authored metadata and answers for expansion batch 01", () => {
    for (const [id, name, field, method, tier, ingredientIds] of EXPANSION_BATCH_01) {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get(id);

      expect(recipe).toMatchObject({ id, name, field, method, tier });
      expect(recipe?.ingredients.map((ingredient) => ingredient.id).sort()).toEqual(
        [...ingredientIds].sort(),
      );
      expect(findSecretRecipe(method, [...ingredientIds].reverse())?.id).toBe(id);
    }
  });

  it("수정된 기존 백 개 레시피 조합이 임의로 바뀌지 않게 고정한다", () => {
    const legacyAnswers = COOKING_SECRET_RECIPES
      .filter(
        (recipe) =>
          !SIMPLE_COOKING_RECIPE_IDS.includes(recipe.id) &&
          !EXPANSION_COOKING_RECIPE_IDS.includes(recipe.id),
      )
      .map(
        (recipe) =>
          `${recipe.id}=${canonicalCookingCombination(
            recipe.method,
            recipe.ingredients.map((ingredient) => ingredient.id),
          )}`,
      )
      .sort();

    expect(
      createHash("sha256").update(legacyAnswers.join("\n")).digest("hex"),
    ).toBe("43b0a2f3dab0f0e02ffb30739b01673b7fd86574a6e34b4677b4bf62d80db382");
  });

  it("provides optimized artwork for every simple recipe", () => {
    const missing = SIMPLE_COOKING_RECIPE_IDS.flatMap((id) => {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get(id);
      if (!recipe) return [`missing_recipe:${id}`];
      const imagePath = path.join(process.cwd(), "public", recipe.imageSrc);
      return existsSync(imagePath) ? [] : [recipe.imageSrc];
    });

    expect(missing).toEqual([]);
  });

  it("keeps the golden rice congee background transparent in light mode", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("golden_rice_congee")!;
    const image = sharp(
      path.join(process.cwd(), "public", recipe.imageSrc),
    );
    const metadata = await image.metadata();

    expect(metadata).toMatchObject({
      width: 256,
      height: 256,
      hasAlpha: true,
    });
    const stats = await image.stats();
    expect(stats.channels[3]?.min).toBe(0);
  });

  it("provides optimized transparent artwork for every completed expansion batch", async () => {
    const missing = COOKING_EXPANSION_ROWS.flatMap(([id]) => {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get(id);
      if (!recipe) return [`missing_recipe:${id}`];
      const imagePath = path.join(process.cwd(), "public", recipe.imageSrc);
      return existsSync(imagePath) ? [] : [recipe.imageSrc];
    });

    expect(missing).toEqual([]);
    for (const [id] of COOKING_EXPANSION_ROWS) {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get(id)!;
      const metadata = await sharp(
        path.join(process.cwd(), "public", recipe.imageSrc),
      ).metadata();
      expect(metadata).toMatchObject({ width: 256, height: 256, hasAlpha: true });
    }
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
