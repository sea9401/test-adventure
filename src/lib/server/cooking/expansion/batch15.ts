import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_15 = {
  id: "15",
  answers: [
  { recipeId: "corn_herb_flour_fry", ingredientIds: ["farm:corn","farm:herb","processed:flour"] },
  { recipeId: "soybean_salt_butter_skewer", ingredientIds: ["farm:soybean","pantry:salt","processed:butter"] },
  { recipeId: "corn_butter_golden_rice_milk_potage", ingredientIds: ["farm:corn","processed:butter","farm:golden_rice","farm:milk"] },
  { recipeId: "black_soybean_onion_rice_sauce_heirloom_tomato_soup", ingredientIds: ["farm:black_soybean","farm:onion","farm:rice","processed:sauce","farm:heirloom_tomato"] },
  { recipeId: "white_strawberry_royal_cacao_crystal_sugar_milk_pork_bread", ingredientIds: ["farm:white_strawberry","farm:royal_cacao","farm:crystal_sugarcane","farm:milk","farm:pork"] },
  { recipeId: "cacao_flour_pie", ingredientIds: ["farm:cacao","processed:flour"] },
  { recipeId: "common_fish_herb_skillet", ingredientIds: ["fishing:catch_common","farm:herb"] },
  { recipeId: "common_fish_rice_fermented_seafood", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "strawberry_spice_punch", ingredientIds: ["farm:strawberry","pantry:spice"] },
  { recipeId: "cacao_rice_strawberry_extract", ingredientIds: ["farm:cacao","farm:rice","farm:strawberry"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
