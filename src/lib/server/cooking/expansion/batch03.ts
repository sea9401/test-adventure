import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_03 = { id: "03", answers: [
  { recipeId: "tomato_onion_grill", ingredientIds: ["farm:tomato", "farm:onion"] },
  { recipeId: "egg_cheese_fritter", ingredientIds: ["farm:egg", "processed:cheese", "pantry:oil"] },
  { recipeId: "milk_onion_broth", ingredientIds: ["farm:milk", "farm:onion"] },
  { recipeId: "black_bean_pork_stew", ingredientIds: ["farm:black_soybean", "farm:pork", "processed:broth", "pantry:spice"] },
  { recipeId: "corn_butter_biscuit", ingredientIds: ["farm:corn", "processed:butter", "processed:flour"] },
  { recipeId: "royal_cacao_mousse", ingredientIds: ["farm:royal_cacao", "processed:cream", "farm:sugarcane", "farm:milk"] },
  { recipeId: "salt_fresh_fish_soup", ingredientIds: ["fishing:catch_fresh", "pantry:salt"] },
  { recipeId: "tomato_fish_steam", ingredientIds: ["fishing:catch_common", "farm:tomato", "farm:herb"] },
  { recipeId: "strawberry_herb_tea", ingredientIds: ["farm:strawberry", "farm:herb"] },
  { recipeId: "pearl_onion_silver_brew", ingredientIds: ["farm:pearl_onion", "farm:silverleaf", "farm:herb", "farm:crystal_sugarcane", "pantry:spice"] },
] } as const satisfies CookingExpansionAnswerBatch;
