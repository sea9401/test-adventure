import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_09 = {
  id: "09",
  answers: [
  { recipeId: "pork_corn_pepper_golden_rice_grill", ingredientIds: ["farm:pork","farm:corn","pantry:pepper","farm:golden_rice"] },
  { recipeId: "heirloom_tomato_soybean_salt_potato_butter_fritter", ingredientIds: ["farm:heirloom_tomato","farm:soybean","pantry:salt","farm:potato","processed:butter"] },
  { recipeId: "golden_rice_heirloom_tomato_butter_milk_salt_broth", ingredientIds: ["farm:golden_rice","farm:heirloom_tomato","processed:butter","farm:milk","pantry:salt"] },
  { recipeId: "onion_rice_steam_hotpot", ingredientIds: ["farm:onion","farm:rice"] },
  { recipeId: "wheat_sugar_aged_cream", ingredientIds: ["farm:wheat","processed:cream"] },
  { recipeId: "milk_onion_gratin", ingredientIds: ["farm:milk","farm:onion"] },
  { recipeId: "common_fish_soybean_skillet", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "fresh_fish_vinegar_herb_charcoal_grill", ingredientIds: ["fishing:catch_fresh","pantry:vinegar","farm:herb"] },
  { recipeId: "sugar_soybean_rice_herbal_steamed_cake", ingredientIds: ["farm:sugarcane","farm:soybean","farm:rice"] },
  { recipeId: "rice_herb_cacao_tonic", ingredientIds: ["farm:rice","farm:herb","farm:cacao"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
