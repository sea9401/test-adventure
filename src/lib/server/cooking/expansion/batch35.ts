import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_35 = {
  id: "35",
  answers: [
  { recipeId: "corn_sauce_pork_stir_fry", ingredientIds: ["farm:corn","processed:sauce","farm:pork"] },
  { recipeId: "pork_corn_herb_fritter", ingredientIds: ["farm:pork","farm:corn","farm:herb"] },
  { recipeId: "tomato_sauce_cheese_nutritious_steam", ingredientIds: ["farm:tomato","processed:sauce","processed:cheese"] },
  { recipeId: "soybean_corn_salt_potato_steam_hotpot", ingredientIds: ["farm:soybean","farm:corn","pantry:salt","farm:potato"] },
  { recipeId: "crystal_sugar_white_strawberry_wheat_potato_cream_steamed_cake", ingredientIds: ["farm:crystal_sugarcane","farm:white_strawberry","farm:wheat","farm:potato","processed:cream"] },
  { recipeId: "wheat_butter_fermented_bread", ingredientIds: ["farm:wheat","processed:butter"] },
  { recipeId: "common_fish_tomato_skewer", ingredientIds: ["fishing:catch_common","farm:tomato"] },
  { recipeId: "common_fish_onion_croquette", ingredientIds: ["fishing:catch_common","farm:onion"] },
  { recipeId: "rice_cacao_punch", ingredientIds: ["farm:rice","farm:cacao"] },
  { recipeId: "soybean_rice_sugar_extract", ingredientIds: ["farm:soybean","farm:rice","farm:sugarcane"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
