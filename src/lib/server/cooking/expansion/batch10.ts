import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_10 = {
  id: "10",
  answers: [
  { recipeId: "rice_pepper_fry", ingredientIds: ["farm:rice","pantry:pepper"] },
  { recipeId: "egg_broth_skewer", ingredientIds: ["farm:egg","processed:broth"] },
  { recipeId: "milk_pork_nutritious_steam", ingredientIds: ["farm:milk","farm:pork"] },
  { recipeId: "pork_sauce_potage", ingredientIds: ["farm:pork","processed:sauce"] },
  { recipeId: "wheat_sugar_butter_steamed_cake", ingredientIds: ["farm:wheat","farm:sugarcane","processed:butter"] },
  { recipeId: "milk_onion_cheese_fermented_bread", ingredientIds: ["farm:milk","farm:onion","processed:cheese"] },
  { recipeId: "fresh_fish_soybean_broth_skewer", ingredientIds: ["fishing:catch_fresh","farm:soybean","processed:broth"] },
  { recipeId: "quality_fish_broth_pearl_onion_tomato_terrine", ingredientIds: ["fishing:catch_quality","processed:broth","farm:pearl_onion","farm:tomato"] },
  { recipeId: "silverleaf_herb_soybean_tomato_golden_wheat_medicinal_porridge", ingredientIds: ["farm:silverleaf","farm:herb","farm:soybean","farm:tomato","farm:golden_wheat"] },
  { recipeId: "crystal_sugar_white_strawberry_heirloom_tomato_pearl_onion_black_soybean_tonic", ingredientIds: ["farm:crystal_sugarcane","farm:white_strawberry","farm:heirloom_tomato","farm:pearl_onion","farm:black_soybean"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
