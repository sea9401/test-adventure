import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_24 = {
  id: "24",
  answers: [
  { recipeId: "onion_pepper_stir_fry", ingredientIds: ["farm:onion","pantry:pepper"] },
  { recipeId: "potato_egg_fritter", ingredientIds: ["farm:potato","farm:egg"] },
  { recipeId: "potato_pork_salt_chowder", ingredientIds: ["farm:potato","farm:pork","pantry:salt"] },
  { recipeId: "tomato_cheese_broth_steam_hotpot", ingredientIds: ["farm:tomato","processed:cheese","processed:broth"] },
  { recipeId: "wheat_sugar_butter_tart", ingredientIds: ["farm:wheat","farm:sugarcane","processed:butter"] },
  { recipeId: "milk_cacao_flour_strawberry_fermented_bread", ingredientIds: ["farm:milk","farm:cacao","processed:flour","farm:strawberry"] },
  { recipeId: "quality_fish_salt_golden_rice_sauce_clear_broth", ingredientIds: ["fishing:catch_quality","pantry:salt","farm:golden_rice","processed:sauce"] },
  { recipeId: "special_seafood_soybean_broth_silverleaf_rice_fermented_seafood", ingredientIds: ["fishing:catch_special","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "tomato_spice_fermented_drink", ingredientIds: ["farm:tomato","pantry:spice"] },
  { recipeId: "strawberry_rice_extract", ingredientIds: ["farm:strawberry","farm:rice"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
