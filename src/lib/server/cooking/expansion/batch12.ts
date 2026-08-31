import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_12 = {
  id: "12",
  answers: [
  { recipeId: "onion_rice_sauce_fry", ingredientIds: ["farm:onion","farm:rice","processed:sauce"] },
  { recipeId: "potato_black_soybean_egg_butter_skillet", ingredientIds: ["farm:potato","farm:black_soybean","farm:egg","processed:butter"] },
  { recipeId: "pearl_onion_milk_pork_butter_corn_porridge", ingredientIds: ["farm:pearl_onion","farm:milk","farm:pork","processed:butter","farm:corn"] },
  { recipeId: "heirloom_tomato_black_soybean_sauce_cheese_onion_chowder", ingredientIds: ["farm:heirloom_tomato","farm:black_soybean","processed:sauce","processed:cheese","farm:onion"] },
  { recipeId: "flour_egg_aged_cream", ingredientIds: ["farm:egg","processed:cream"] },
  { recipeId: "strawberry_pork_cookie", ingredientIds: ["farm:strawberry","farm:pork"] },
  { recipeId: "common_fish_soybean_fritter", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "common_fish_vinegar_terrine", ingredientIds: ["fishing:catch_common","pantry:vinegar"] },
  { recipeId: "soybean_tomato_herb_medicinal_porridge", ingredientIds: ["farm:soybean","farm:tomato","farm:herb"] },
  { recipeId: "tomato_sugar_vinegar_restorative_dish", ingredientIds: ["farm:tomato","farm:sugarcane","pantry:vinegar"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
