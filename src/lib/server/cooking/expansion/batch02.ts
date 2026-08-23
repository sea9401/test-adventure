import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_02 = { id: "02", answers: [
  { recipeId: "onion_egg_scramble", ingredientIds: ["farm:egg", "farm:onion"] },
  { recipeId: "soy_pork_stir_fry", ingredientIds: ["farm:pork", "farm:soybean", "pantry:oil"] },
  { recipeId: "corn_potato_soup", ingredientIds: ["farm:corn", "farm:potato"] },
  { recipeId: "tomato_rice_stew", ingredientIds: ["farm:tomato", "farm:rice", "processed:broth", "pantry:spice"] },
  { recipeId: "strawberry_scone", ingredientIds: ["farm:strawberry", "processed:flour", "processed:butter"] },
  { recipeId: "cacao_cream_roll", ingredientIds: ["farm:cacao", "processed:cream", "processed:flour", "farm:sugarcane"] },
  { recipeId: "oil_grilled_fresh_fish", ingredientIds: ["fishing:catch_fresh", "pantry:oil"] },
  { recipeId: "soy_steamed_fish", ingredientIds: ["fishing:catch_quality", "farm:soybean", "farm:onion"] },
  { recipeId: "silverleaf_milk_tea", ingredientIds: ["farm:silverleaf", "farm:milk"] },
  { recipeId: "golden_rice_elixir", ingredientIds: ["farm:golden_rice", "farm:herb", "farm:crystal_sugarcane", "pantry:spice", "pantry:vinegar"] },
] } as const satisfies CookingExpansionAnswerBatch;
