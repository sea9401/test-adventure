import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_30 = {
  id: "30",
  answers: [
  { recipeId: "rice_flour_stir_fry", ingredientIds: ["farm:rice","processed:flour"] },
  { recipeId: "corn_herb_fritter", ingredientIds: ["farm:corn","farm:herb"] },
  { recipeId: "milk_salt_nutritious_steam", ingredientIds: ["farm:milk","pantry:salt"] },
  { recipeId: "pork_tomato_hotpot", ingredientIds: ["farm:pork","farm:tomato"] },
  { recipeId: "egg_milk_aged_cream", ingredientIds: ["farm:egg","farm:milk"] },
  { recipeId: "strawberry_pork_cream_pudding", ingredientIds: ["farm:strawberry","farm:pork","processed:cream"] },
  { recipeId: "fresh_fish_soybean_broth_seafood_pot_steam", ingredientIds: ["fishing:catch_fresh","farm:soybean","processed:broth"] },
  { recipeId: "fresh_fish_vinegar_herb_fish_soup", ingredientIds: ["fishing:catch_fresh","pantry:vinegar","farm:herb"] },
  { recipeId: "sugar_vinegar_herb_rice_fermented_drink", ingredientIds: ["farm:sugarcane","pantry:vinegar","farm:herb","farm:rice"] },
  { recipeId: "rice_white_strawberry_crystal_sugar_silverleaf_extract", ingredientIds: ["farm:rice","farm:white_strawberry","farm:crystal_sugarcane","farm:silverleaf"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
