import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_18 = {
  id: "18",
  answers: [
  { recipeId: "rice_pepper_pork_fry", ingredientIds: ["farm:rice","pantry:pepper","farm:pork"] },
  { recipeId: "egg_broth_soybean_skewer", ingredientIds: ["farm:egg","processed:broth","farm:soybean"] },
  { recipeId: "milk_pork_butter_stew", ingredientIds: ["farm:milk","farm:pork","processed:butter"] },
  { recipeId: "pork_sauce_cheese_onion_broth", ingredientIds: ["farm:pork","processed:sauce","processed:cheese","farm:onion"] },
  { recipeId: "crystal_sugar_butter_white_strawberry_milk_pork_aged_cream", ingredientIds: ["farm:crystal_sugarcane","processed:butter","farm:white_strawberry","farm:milk","processed:cream"] },
  { recipeId: "white_strawberry_crystal_sugar_milk_potato_cream_pudding", ingredientIds: ["farm:white_strawberry","farm:crystal_sugarcane","farm:milk","farm:potato","processed:cream"] },
  { recipeId: "common_fish_herb_fritter", ingredientIds: ["fishing:catch_common","farm:herb"] },
  { recipeId: "common_fish_rice_terrine", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "herb_soybean_herbal_steamed_cake", ingredientIds: ["farm:herb","farm:soybean"] },
  { recipeId: "cacao_strawberry_tonic", ingredientIds: ["farm:cacao","farm:strawberry"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
