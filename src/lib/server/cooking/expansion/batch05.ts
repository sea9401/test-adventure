import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_05 = { id: "05", answers: [
  { recipeId: "butter_onion_grill", ingredientIds: ["farm:onion", "processed:butter"] },
  { recipeId: "pork_egg_fry", ingredientIds: ["farm:pork", "farm:egg", "pantry:oil"] },
  { recipeId: "tomato_rice_soup", ingredientIds: ["farm:tomato", "farm:rice"] },
  { recipeId: "cheese_corn_stew", ingredientIds: ["farm:corn", "processed:cheese", "farm:milk", "pantry:pepper"] },
  { recipeId: "potato_cheese_bake", ingredientIds: ["farm:potato", "processed:cheese", "processed:butter"] },
  { recipeId: "strawberry_custard_tart", ingredientIds: ["farm:strawberry", "farm:egg", "processed:cream", "processed:flour"] },
  { recipeId: "oil_common_fish_fry", ingredientIds: ["fishing:catch_common", "pantry:oil"] },
  { recipeId: "herb_fish_broth", ingredientIds: ["fishing:catch_fresh", "farm:herb", "processed:broth"] },
  { recipeId: "silverleaf_sugar_tea", ingredientIds: ["farm:silverleaf", "farm:sugarcane"] },
  { recipeId: "ancient_tomato_elixir", ingredientIds: ["farm:heirloom_tomato", "farm:herb", "farm:crystal_sugarcane", "pantry:vinegar", "pantry:spice"] },
] } as const satisfies CookingExpansionAnswerBatch;
