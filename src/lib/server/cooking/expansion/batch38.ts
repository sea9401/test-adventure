import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_38 = {
  id: "38",
  answers: [
  { recipeId: "rice_flour_onion_stir_fry", ingredientIds: ["farm:rice","processed:flour","farm:onion"] },
  { recipeId: "egg_potato_oil_fritter", ingredientIds: ["farm:egg","farm:potato","pantry:oil"] },
  { recipeId: "rice_spice_onion_chowder", ingredientIds: ["farm:rice","pantry:spice","farm:onion"] },
  { recipeId: "potato_milk_pork_steam_hotpot", ingredientIds: ["farm:potato","farm:milk","farm:pork"] },
  { recipeId: "flour_onion_cheese_golden_wheat_biscuit", ingredientIds: ["processed:flour","farm:onion","processed:cheese","farm:golden_wheat"] },
  { recipeId: "crystal_sugar_white_strawberry_wheat_potato_cream_fermented_bread", ingredientIds: ["farm:crystal_sugarcane","farm:white_strawberry","farm:wheat","farm:potato","processed:cream"] },
  { recipeId: "common_fish_tomato_clear_broth", ingredientIds: ["fishing:catch_common","farm:tomato"] },
  { recipeId: "common_fish_rice_sauce_fry", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "tomato_vinegar_herbal_steamed_cake", ingredientIds: ["farm:tomato","pantry:vinegar"] },
  { recipeId: "soybean_rice_tonic", ingredientIds: ["farm:soybean","farm:rice"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
