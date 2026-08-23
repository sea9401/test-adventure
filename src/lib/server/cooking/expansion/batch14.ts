import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_14 = {
  id: "14",
  answers: [
  { recipeId: "rice_flour_grill", ingredientIds: ["farm:rice","processed:flour"] },
  { recipeId: "egg_potato_skillet", ingredientIds: ["farm:egg","farm:potato"] },
  { recipeId: "milk_salt_potato_hotpot", ingredientIds: ["farm:milk","pantry:salt","farm:potato"] },
  { recipeId: "pork_tomato_herb_steam_hotpot", ingredientIds: ["farm:pork","farm:tomato","farm:herb"] },
  { recipeId: "wheat_sugar_butter_aged_cream", ingredientIds: ["farm:wheat","farm:sugarcane","processed:butter"] },
  { recipeId: "milk_onion_cheese_golden_wheat_pudding", ingredientIds: ["farm:milk","farm:onion","processed:cheese","farm:golden_wheat"] },
  { recipeId: "special_seafood_soybean_broth_silverleaf_rice_skewer", ingredientIds: ["fishing:catch_special","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "legendary_seafood_soybean_broth_silverleaf_rice_terrine", ingredientIds: ["fishing:catch_legendary","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "rice_strawberry_herbal_steamed_cake", ingredientIds: ["farm:rice","farm:strawberry"] },
  { recipeId: "soybean_spice_tonic", ingredientIds: ["farm:soybean","pantry:spice"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
