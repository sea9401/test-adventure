import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_11 = {
  id: "11",
  answers: [
  { recipeId: "corn_sauce_grill", ingredientIds: ["farm:corn","processed:sauce"] },
  { recipeId: "soybean_tomato_broth_fritter", ingredientIds: ["farm:soybean","farm:tomato","processed:broth"] },
  { recipeId: "corn_cream_butter_nutritious_steam", ingredientIds: ["farm:corn","processed:cream","processed:butter"] },
  { recipeId: "rice_onion_sauce_broth", ingredientIds: ["farm:rice","farm:onion","processed:sauce"] },
  { recipeId: "wheat_potato_butter_crystal_sugar_bread", ingredientIds: ["farm:wheat","farm:potato","processed:butter","farm:crystal_sugarcane"] },
  { recipeId: "crystal_sugar_milk_potato_cream_wheat_fermented_bread", ingredientIds: ["farm:crystal_sugarcane","farm:milk","farm:potato","processed:cream","farm:wheat"] },
  { recipeId: "legendary_seafood_soybean_broth_silverleaf_rice_skillet", ingredientIds: ["fishing:catch_legendary","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "common_fish_vinegar_croquette", ingredientIds: ["fishing:catch_common","pantry:vinegar"] },
  { recipeId: "herb_vinegar_punch", ingredientIds: ["farm:herb","pantry:vinegar"] },
  { recipeId: "sugar_tomato_medicinal_pickle", ingredientIds: ["farm:sugarcane","farm:tomato"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
