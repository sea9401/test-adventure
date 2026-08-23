import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_22 = {
  id: "22",
  answers: [
  { recipeId: "rice_flour_onion_grill", ingredientIds: ["farm:rice","processed:flour","farm:onion"] },
  { recipeId: "egg_black_soybean_butter_potato_fritter", ingredientIds: ["farm:egg","farm:black_soybean","processed:butter","farm:potato"] },
  { recipeId: "milk_pork_butter_corn_nutritious_steam", ingredientIds: ["farm:milk","farm:pork","processed:butter","farm:corn"] },
  { recipeId: "heirloom_tomato_sauce_cheese_onion_broth_steam_hotpot", ingredientIds: ["farm:heirloom_tomato","processed:sauce","processed:cheese","farm:onion","processed:broth"] },
  { recipeId: "strawberry_sugar_biscuit", ingredientIds: ["farm:strawberry","farm:sugarcane"] },
  { recipeId: "cacao_flour_pudding", ingredientIds: ["farm:cacao","processed:flour"] },
  { recipeId: "common_fish_soybean_fish_pickle", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "common_fish_vinegar_charcoal_grill", ingredientIds: ["fishing:catch_common","pantry:vinegar"] },
  { recipeId: "strawberry_sugar_vinegar_punch", ingredientIds: ["farm:strawberry","farm:sugarcane","pantry:vinegar"] },
  { recipeId: "cacao_strawberry_tomato_medicinal_pickle", ingredientIds: ["farm:cacao","farm:strawberry","farm:tomato"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
