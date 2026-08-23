import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_04 = { id: "04", answers: [
  { recipeId: "salted_onion_grill", ingredientIds: ["farm:onion", "pantry:salt"] },
  { recipeId: "corn_egg_fritter", ingredientIds: ["farm:corn", "farm:egg", "pantry:oil"] },
  { recipeId: "soybean_rice_porridge", ingredientIds: ["farm:soybean", "farm:rice"] },
  { recipeId: "cream_pork_chowder", ingredientIds: ["farm:pork", "processed:cream", "farm:potato", "farm:onion"] },
  { recipeId: "cheese_onion_bread", ingredientIds: ["processed:flour", "processed:cheese", "farm:onion"] },
  { recipeId: "cacao_butter_cake", ingredientIds: ["farm:cacao", "processed:butter", "processed:flour", "farm:egg"] },
  { recipeId: "vinegar_common_cure", ingredientIds: ["fishing:catch_common", "pantry:vinegar"] },
  { recipeId: "fish_rice_ball", ingredientIds: ["fishing:catch_quality", "farm:rice", "pantry:vinegar"] },
  { recipeId: "cacao_herb_brew", ingredientIds: ["farm:cacao", "farm:herb"] },
  { recipeId: "whiteberry_moon_tea", ingredientIds: ["farm:white_strawberry", "farm:silverleaf", "farm:crystal_sugarcane", "farm:royal_cacao", "pantry:spice"] },
] } as const satisfies CookingExpansionAnswerBatch;
