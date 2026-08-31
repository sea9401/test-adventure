import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_20 = {
  id: "20",
  answers: [
  { recipeId: "onion_rice_grill", ingredientIds: ["farm:onion","farm:rice"] },
  { recipeId: "potato_oil_skillet", ingredientIds: ["farm:potato","pantry:oil"] },
  { recipeId: "potato_milk_nutritious_steam", ingredientIds: ["farm:potato","farm:milk"] },
  { recipeId: "tomato_herb_stew", ingredientIds: ["farm:tomato","farm:herb"] },
  { recipeId: "egg_milk_potato_aged_cream", ingredientIds: ["farm:egg","farm:milk","processed:cream"] },
  { recipeId: "strawberry_pork_cream_cookie", ingredientIds: ["farm:strawberry","farm:pork","processed:cream"] },
  { recipeId: "fresh_fish_soybean_broth_skillet", ingredientIds: ["fishing:catch_fresh","farm:soybean","processed:broth"] },
  { recipeId: "quality_fish_tomato_oil_soybean_charcoal_grill", ingredientIds: ["fishing:catch_quality","farm:tomato","pantry:oil","farm:soybean"] },
  { recipeId: "cacao_golden_wheat_strawberry_vinegar_herbal_steamed_cake", ingredientIds: ["farm:cacao","farm:golden_wheat","farm:strawberry","pantry:vinegar"] },
  { recipeId: "golden_rice_black_soybean_royal_cacao_spice_white_strawberry_medicinal_pickle", ingredientIds: ["farm:golden_rice","farm:black_soybean","farm:royal_cacao","pantry:spice","farm:white_strawberry"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
