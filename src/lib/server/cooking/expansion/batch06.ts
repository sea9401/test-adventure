import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_06 = { id: "06", answers: [
  { recipeId: "egg_butter_scramble", ingredientIds: ["farm:egg", "processed:butter"] },
  { recipeId: "onion_pork_skewer", ingredientIds: ["farm:pork", "farm:onion", "pantry:pepper"] },
  { recipeId: "corn_milk_porridge", ingredientIds: ["farm:corn", "farm:milk"] },
  { recipeId: "soy_tomato_hotpot", ingredientIds: ["farm:soybean", "farm:tomato", "processed:broth", "pantry:spice"] },
  { recipeId: "cacao_butter_cookie", ingredientIds: ["farm:cacao", "processed:butter", "processed:flour"] },
  { recipeId: "cheese_pork_pie", ingredientIds: ["farm:pork", "processed:cheese", "processed:flour", "processed:butter"] },
  { recipeId: "pepper_fish_pan_fry", ingredientIds: ["fishing:catch_common", "pantry:pepper"] },
  { recipeId: "onion_fish_soup", ingredientIds: ["fishing:catch_quality", "farm:onion", "processed:broth"] },
  { recipeId: "milk_herb_tea", ingredientIds: ["farm:milk", "farm:herb"] },
  { recipeId: "black_bean_royal_tonic", ingredientIds: ["farm:black_soybean", "farm:royal_cacao", "farm:silverleaf", "farm:crystal_sugarcane", "pantry:spice"] },
] } as const satisfies CookingExpansionAnswerBatch;
