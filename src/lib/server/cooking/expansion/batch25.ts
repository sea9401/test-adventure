import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_25 = {
  id: "25",
  answers: [
  { recipeId: "pork_corn_pepper_grill", ingredientIds: ["farm:pork","farm:corn","pantry:pepper"] },
  { recipeId: "tomato_soybean_salt_skillet", ingredientIds: ["farm:tomato","farm:soybean","pantry:salt"] },
  { recipeId: "soybean_butter_corn_nutritious_steam", ingredientIds: ["farm:soybean","processed:butter","farm:corn"] },
  { recipeId: "onion_rice_sauce_heirloom_tomato_steam_hotpot", ingredientIds: ["farm:onion","farm:rice","processed:sauce","farm:heirloom_tomato"] },
  { recipeId: "wheat_white_strawberry_potato_cream_aged_cream", ingredientIds: ["farm:wheat","farm:white_strawberry","farm:potato","processed:cream"] },
  { recipeId: "wheat_butter_pudding", ingredientIds: ["farm:wheat","processed:butter"] },
  { recipeId: "common_fish_herb_seafood_pot_steam", ingredientIds: ["fishing:catch_common","farm:herb"] },
  { recipeId: "common_fish_vinegar_potage", ingredientIds: ["fishing:catch_common","pantry:vinegar"] },
  { recipeId: "strawberry_vinegar_medicinal_porridge", ingredientIds: ["farm:strawberry","pantry:vinegar"] },
  { recipeId: "sugar_cacao_restorative_dish", ingredientIds: ["farm:sugarcane","farm:cacao"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
