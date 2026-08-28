import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_21 = {
  id: "21",
  answers: [
  { recipeId: "pork_herb_stir_fry", ingredientIds: ["farm:pork","farm:herb"] },
  { recipeId: "tomato_butter_oil_skewer", ingredientIds: ["farm:tomato","processed:butter","pantry:oil"] },
  { recipeId: "soybean_cream_potato_nutritious_steam", ingredientIds: ["farm:soybean","processed:cream","farm:potato"] },
  { recipeId: "onion_spice_herb_porridge", ingredientIds: ["farm:onion","pantry:spice","farm:herb"] },
  { recipeId: "wheat_sugar_pork_white_strawberry_steamed_cake", ingredientIds: ["farm:wheat","farm:sugarcane","farm:pork","farm:white_strawberry"] },
  { recipeId: "milk_cheese_royal_cacao_strawberry_fermented_bread", ingredientIds: ["farm:milk","processed:cheese","farm:royal_cacao","processed:flour"] },
  { recipeId: "special_seafood_soybean_broth_silverleaf_rice_fritter", ingredientIds: ["fishing:catch_special","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "common_fish_onion_fermented_seafood", ingredientIds: ["fishing:catch_common","farm:onion"] },
  { recipeId: "herb_rice_medicinal_porridge", ingredientIds: ["farm:herb","farm:rice"] },
  { recipeId: "soybean_sugar_restorative_dish", ingredientIds: ["farm:soybean","farm:sugarcane"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
