import "server-only";

import {
  COOKING_LEGACY_RECIPE_INDEX_BY_ID,
  COOKING_PUBLIC_RECIPES,
  EXPANSION_COOKING_RECIPE_IDS,
} from "@/adventure/v2/cooking/catalog";
import { canonicalCookingEffect } from "@/adventure/v2/cooking/expansion/effects";
import type {
  CookingField,
  CookingIngredientId,
  CookingMethod,
  CookingRecipeSecret,
} from "@/adventure/v2/cooking/types";
import { COOKING_EXPANSION_ANSWERS } from "./expansion";

const INGREDIENT_POOLS: Record<CookingField, readonly CookingIngredientId[]> = {
  hearth: [
    "farm:pork", "farm:egg", "farm:onion", "farm:tomato", "farm:corn",
    "farm:rice", "farm:soybean", "farm:herb", "pantry:oil", "pantry:pepper",
    "pantry:salt", "processed:sauce", "processed:broth", "processed:flour",
  ],
  pot: [
    "farm:potato", "farm:onion", "farm:corn", "farm:tomato", "farm:milk",
    "farm:rice", "farm:soybean", "farm:herb", "farm:pork", "processed:broth",
    "processed:cream", "processed:sauce", "pantry:salt", "pantry:spice",
  ],
  baking: [
    "farm:wheat", "farm:egg", "farm:milk", "farm:strawberry", "farm:sugarcane",
    "farm:cacao", "farm:potato", "farm:onion", "farm:pork", "processed:flour",
    "processed:butter", "processed:cheese", "processed:cream", "pantry:yeast",
  ],
  seafood: [
    "fishing:catch_common", "fishing:catch_fresh", "fishing:catch_quality",
    "fishing:catch_special", "fishing:catch_legendary", "farm:rice", "farm:onion",
    "farm:soybean", "farm:herb", "farm:tomato", "processed:sauce", "processed:broth",
    "pantry:salt", "pantry:oil", "pantry:vinegar",
  ],
  medicinal: [
    "farm:herb", "farm:silverleaf", "farm:strawberry", "farm:white_strawberry",
    "farm:soybean", "farm:black_soybean", "farm:sugarcane", "farm:crystal_sugarcane",
    "farm:cacao", "farm:royal_cacao", "farm:tomato", "farm:heirloom_tomato",
    "farm:rice", "farm:golden_rice", "pantry:vinegar", "pantry:spice",
  ],
};

const EXPLICIT_COMBINATIONS: Record<string, readonly CookingIngredientId[]> = {
  rustic_bread: ["farm:wheat", "pantry:yeast"],
  herb_tea: ["farm:herb", "farm:sugarcane"],
  grilled_corn: ["farm:corn", "pantry:oil"],
  fish_skewer: ["fishing:catch_common", "farm:herb"],
  herb_flatbread: ["farm:wheat", "farm:herb"],
  country_egg_bread: ["farm:egg", "farm:wheat"],
  fried_egg: ["farm:egg", "pantry:salt"],
  boiled_egg: ["farm:egg", "pantry:salt"],
  grilled_potato: ["farm:potato", "pantry:salt"],
  buttered_corn: ["farm:corn", "processed:butter"],
  simple_tomato_soup: ["farm:tomato", "processed:broth"],
  milk_bread: ["farm:wheat", "farm:milk"],
  sugar_cookie: ["farm:wheat", "farm:sugarcane"],
  strawberry_jam: ["farm:strawberry", "farm:sugarcane"],
  campfire_fish: ["fishing:catch_common", "pantry:salt"],
  simple_fish_soup: ["fishing:catch_common", "processed:broth"],
  strawberry_milk: ["farm:strawberry", "farm:milk"],
  hot_cacao: ["farm:cacao", "farm:milk"],
  tomato_egg_stir_fry: ["farm:tomato", "farm:egg", "pantry:oil"],
  potato_fries: ["farm:potato", "pantry:oil", "pantry:salt"],
  herb_egg_soup: ["farm:egg", "farm:herb", "pantry:salt"],
  corn_cream_soup: ["farm:corn", "farm:milk", "pantry:salt"],
  cacao_cookie: ["farm:wheat", "farm:cacao", "farm:sugarcane"],
  fish_fry: ["fishing:catch_common", "processed:flour", "pantry:oil"],
  steamed_fish: ["fishing:catch_fresh", "farm:onion", "pantry:salt"],
  herb_pickles: ["farm:herb", "pantry:vinegar", "pantry:salt"],
  ...Object.fromEntries(
    COOKING_EXPANSION_ANSWERS.map((answer) => [
      answer.recipeId,
      answer.ingredientIds,
    ]),
  ),
};

const NAMED_ANCHORS: readonly [needle: string, ingredient: CookingIngredientId][] = [
  ["legendary", "fishing:catch_legendary"], ["dragonfire", "fishing:catch_legendary"],
  ["abyssal", "fishing:catch_special"], ["seafood", "fishing:catch_special"],
  ["fish", "fishing:catch_quality"], ["pork", "farm:pork"],
  ["egg", "farm:egg"], ["tomato", "farm:tomato"], ["corn", "farm:corn"],
  ["strawberry", "farm:strawberry"], ["potato", "farm:potato"],
  ["onion", "farm:onion"], ["rice", "farm:rice"], ["soy", "farm:soybean"],
  ["bean", "farm:soybean"], ["cacao", "farm:cacao"], ["herb", "farm:herb"],
  ["ranch", "farm:milk"], ["cream", "processed:cream"], ["cheese", "processed:cheese"],
  ["bread", "processed:flour"], ["pastry", "processed:flour"],
];

const NAMED_RARE_ANCHORS: readonly [
  ingredientName: string,
  ingredient: CookingIngredientId,
][] = [
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
];

function slotsForTier(tier: number): number {
  if (tier <= 1) return 2;
  if (tier === 2) return 3;
  if (tier === 3) return 4;
  return 5;
}

function ingredientsForRecipe(
  recipe: (typeof COOKING_PUBLIC_RECIPES)[number],
  index: number,
  usedAnswers: Set<string>,
): readonly CookingIngredientId[] {
  const explicit = EXPLICIT_COMBINATIONS[recipe.id];
  if (explicit) return explicit;
  const pool = INGREDIENT_POOLS[recipe.field];
  const anchors = [
    ...NAMED_RARE_ANCHORS.flatMap(([ingredientName, ingredient]) =>
      recipe.name.includes(ingredientName) ? [ingredient] : [],
    ),
    ...NAMED_ANCHORS.flatMap(([needle, ingredient]) =>
      recipe.id.includes(needle) ? [ingredient] : [],
    ),
  ];
  const wanted = slotsForTier(recipe.tier);
  for (let salt = 0; salt < pool.length * pool.length; salt += 1) {
    const selected = new Set<CookingIngredientId>(anchors.slice(0, wanted));
    let cursor = index * 7 + salt * 3;
    for (let attempts = 0; selected.size < wanted && attempts < pool.length; attempts += 1) {
      selected.add(pool[cursor % pool.length]);
      cursor += 1;
    }
    const answer = canonicalCookingCombination(recipe.method, [...selected]);
    if (answer && !usedAnswers.has(answer)) return [...selected];
  }
  throw new Error(`unable_to_assign_cooking_combination:${recipe.id}`);
}

function ingredientCount(id: CookingIngredientId, tier: number): number {
  if (id.startsWith("fishing:")) return tier >= 5 ? 2 : 1;
  if (id.startsWith("pantry:") || id.startsWith("processed:")) {
    return tier >= 4 ? 2 : 1;
  }
  return Math.max(1, tier + 1);
}

export function canonicalCookingCombination(
  method: CookingMethod,
  ingredientIds: readonly CookingIngredientId[],
): string | null {
  const unique = new Set(ingredientIds);
  if (ingredientIds.length < 2 || unique.size !== ingredientIds.length) return null;
  return `${method}|${[...unique].sort().join("|")}`;
}

const usedAnswers = new Set<string>();
export const COOKING_SECRET_RECIPES: readonly CookingRecipeSecret[] =
  COOKING_PUBLIC_RECIPES.map((recipe, index) => {
    const legacyIndex = COOKING_LEGACY_RECIPE_INDEX_BY_ID.get(recipe.id);
    const ingredientIds = ingredientsForRecipe(
      recipe,
      legacyIndex ?? index,
      usedAnswers,
    );
    const answer = canonicalCookingCombination(recipe.method, ingredientIds);
    if (!answer) throw new Error(`invalid_cooking_combination:${recipe.id}`);
    usedAnswers.add(answer);
    return {
      ...recipe,
      ingredients: ingredientIds.map((id) => ({
        id,
        count: ingredientCount(id, recipe.tier),
      })),
      researchXp: recipe.tier * 100,
      craftXp: recipe.tier * 20,
    };
  });

export const COOKING_SECRET_RECIPE_BY_ID = new Map(
  COOKING_SECRET_RECIPES.map((entry) => [entry.id, entry]),
);
const COOKING_SECRET_RECIPE_BY_ANSWER = new Map(
  COOKING_SECRET_RECIPES.map((entry) => [
    canonicalCookingCombination(
      entry.method,
      entry.ingredients.map((ingredient) => ingredient.id),
    )!,
    entry,
  ]),
);

export function findSecretRecipe(
  method: CookingMethod,
  ingredientIds: readonly CookingIngredientId[],
): CookingRecipeSecret | null {
  const answer = canonicalCookingCombination(method, ingredientIds);
  return answer ? COOKING_SECRET_RECIPE_BY_ANSWER.get(answer) ?? null : null;
}

export function validateCookingRecipeCatalog(): string[] {
  const errors: string[] = [];
  const expectedCount = COOKING_PUBLIC_RECIPES.length;
  if (COOKING_SECRET_RECIPES.length !== expectedCount) errors.push("recipe_count");
  if (new Set(COOKING_SECRET_RECIPES.map((entry) => entry.id)).size !== expectedCount) {
    errors.push("duplicate_id");
  }
  if (usedAnswers.size !== expectedCount) errors.push("duplicate_answer");
  const publicExpansionIds = new Set(EXPANSION_COOKING_RECIPE_IDS);
  const answerExpansionIds = new Set(
    COOKING_EXPANSION_ANSWERS.map((answer) => answer.recipeId),
  );
  if (
    publicExpansionIds.size !== answerExpansionIds.size ||
    [...publicExpansionIds].some((id) => !answerExpansionIds.has(id))
  ) {
    errors.push("expansion_answer_mismatch");
  }
  const effectOwners = new Map<string, string>();
  for (const recipe of COOKING_SECRET_RECIPES) {
    const key = canonicalCookingEffect(recipe.effect);
    if (publicExpansionIds.has(recipe.id)) {
      const owner = effectOwners.get(key);
      if (owner) errors.push(`duplicate_effect:${recipe.id}`);
    }
    if (!effectOwners.has(key)) effectOwners.set(key, recipe.id);
  }
  for (const recipe of COOKING_SECRET_RECIPES) {
    if (recipe.ingredients.length !== slotsForTier(recipe.tier)) {
      errors.push(`wrong_slots:${recipe.id}`);
    }
    if (recipe.imageSrc !== `/images/items/cooking/${recipe.id}.webp`) {
      errors.push(`wrong_image:${recipe.id}`);
    }
  }
  return errors;
}
