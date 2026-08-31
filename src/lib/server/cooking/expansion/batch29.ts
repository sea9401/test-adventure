import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_29 = {
  id: "29",
  answers: [
  { recipeId: "pork_herb_sauce_stir_fry", ingredientIds: ["farm:pork","farm:herb","processed:sauce"] },
  { recipeId: "tomato_soybean_salt_potato_skewer", ingredientIds: ["farm:tomato","farm:soybean","pantry:salt","farm:potato"] },
  { recipeId: "soybean_butter_golden_rice_milk_potage", ingredientIds: ["farm:soybean","processed:butter","farm:golden_rice","farm:milk"] },
  { recipeId: "corn_butter_steam_hotpot", ingredientIds: ["farm:corn","processed:butter"] },
  { recipeId: "egg_milk_steamed_cake", ingredientIds: ["farm:egg","farm:milk"] },
  { recipeId: "strawberry_pork_fermented_bread", ingredientIds: ["farm:strawberry","processed:flour"] },
  { recipeId: "common_fish_soybean_skewer", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "common_fish_rice_croquette", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "strawberry_vinegar_soybean_herbal_steamed_cake", ingredientIds: ["farm:strawberry","pantry:vinegar","farm:soybean"] },
  { recipeId: "cacao_tomato_herb_tonic", ingredientIds: ["farm:cacao","farm:tomato","farm:herb"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
