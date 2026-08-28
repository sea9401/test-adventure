import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_19 = {
  id: "19",
  answers: [
  { recipeId: "corn_pork_pepper_golden_rice_stir_fry", ingredientIds: ["farm:corn","farm:pork","pantry:pepper","farm:golden_rice"] },
  { recipeId: "soybean_salt_potato_butter_fritter", ingredientIds: ["farm:soybean","pantry:salt","farm:potato","processed:butter"] },
  { recipeId: "golden_rice_butter_milk_salt_corn_nutritious_steam", ingredientIds: ["farm:golden_rice","processed:butter","farm:milk","pantry:salt","farm:corn"] },
  { recipeId: "soybean_corn_steam_hotpot", ingredientIds: ["farm:soybean","farm:corn"] },
  { recipeId: "milk_strawberry_bread", ingredientIds: ["farm:milk","processed:flour"] },
  { recipeId: "strawberry_pork_pudding", ingredientIds: ["farm:strawberry","farm:pork"] },
  { recipeId: "common_fish_soybean_seafood_pot_steam", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "fresh_fish_rice_tomato_sauce_fry", ingredientIds: ["fishing:catch_fresh","farm:rice","processed:sauce"] },
  { recipeId: "soybean_herb_cacao_fermented_drink", ingredientIds: ["farm:soybean","farm:herb","farm:cacao"] },
  { recipeId: "tomato_vinegar_soybean_extract", ingredientIds: ["farm:tomato","pantry:vinegar","farm:soybean"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
