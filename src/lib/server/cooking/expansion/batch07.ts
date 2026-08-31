import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_07 = { id: "07", answers: [
  { recipeId: "tomato_egg_grill", ingredientIds: ["farm:tomato", "farm:egg"] },
  { recipeId: "cheese_corn_skewer", ingredientIds: ["farm:corn", "processed:cheese", "pantry:pepper"] },
  { recipeId: "potato_milk_broth", ingredientIds: ["farm:potato", "farm:milk"] },
  { recipeId: "pork_rice_gumbo", ingredientIds: ["farm:pork", "farm:rice", "processed:sauce", "pantry:spice"] },
  { recipeId: "milk_butter_biscuit", ingredientIds: ["farm:milk", "processed:butter", "processed:flour"] },
  { recipeId: "whiteberry_cream_tart", ingredientIds: ["farm:white_strawberry", "processed:cream", "processed:flour", "farm:sugarcane"] },
  { recipeId: "salt_quality_fish_grill", ingredientIds: ["fishing:catch_quality", "pantry:salt"] },
  { recipeId: "tomato_cured_fish", ingredientIds: ["fishing:catch_fresh", "farm:tomato", "pantry:vinegar"] },
  { recipeId: "soybean_milk_tea", ingredientIds: ["farm:soybean", "farm:milk"] },
  { recipeId: "golden_wheat_sun_brew", ingredientIds: ["farm:golden_wheat", "farm:silverleaf", "farm:crystal_sugarcane", "farm:royal_cacao", "farm:herb"] },
] } as const satisfies CookingExpansionAnswerBatch;
