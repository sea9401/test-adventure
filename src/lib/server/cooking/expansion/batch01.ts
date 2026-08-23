import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_01 = {
  id: "01",
  answers: [
    { recipeId: "pepper_pork_grill", ingredientIds: ["farm:pork", "pantry:pepper"] },
    { recipeId: "tomato_cheese_skillet", ingredientIds: ["farm:tomato", "processed:cheese", "pantry:oil"] },
    { recipeId: "butter_potato_mash", ingredientIds: ["farm:potato", "processed:butter"] },
    { recipeId: "pork_onion_broth", ingredientIds: ["farm:pork", "farm:onion", "processed:broth", "pantry:pepper"] },
    { recipeId: "butter_toast", ingredientIds: ["processed:flour", "processed:butter"] },
    { recipeId: "strawberry_cream_cake", ingredientIds: ["farm:strawberry", "processed:flour", "processed:cream", "farm:sugarcane"] },
    { recipeId: "pepper_fresh_fish", ingredientIds: ["fishing:catch_fresh", "pantry:pepper"] },
    { recipeId: "vinegar_cured_fish", ingredientIds: ["fishing:catch_fresh", "pantry:vinegar", "farm:onion"] },
    { recipeId: "soybean_herb_tea", ingredientIds: ["farm:soybean", "farm:herb", "farm:sugarcane"] },
    { recipeId: "silverleaf_crystal_tonic", ingredientIds: ["farm:silverleaf", "farm:crystal_sugarcane", "farm:herb", "farm:royal_cacao", "pantry:spice"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
