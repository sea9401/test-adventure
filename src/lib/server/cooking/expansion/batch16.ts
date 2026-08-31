import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_16 = {
  id: "16",
  answers: [
  { recipeId: "golden_rice_pepper_flour_pork_herb_fry", ingredientIds: ["farm:golden_rice","pantry:pepper","processed:flour","farm:pork","farm:herb"] },
  { recipeId: "black_soybean_heirloom_tomato_egg_butter_potato_skillet", ingredientIds: ["farm:black_soybean","farm:heirloom_tomato","farm:egg","processed:butter","farm:potato"] },
  { recipeId: "potato_pork_nutritious_steam", ingredientIds: ["farm:potato","farm:pork"] },
  { recipeId: "tomato_cheese_hotpot", ingredientIds: ["farm:tomato","processed:cheese"] },
  { recipeId: "egg_milk_tart", ingredientIds: ["farm:egg","farm:milk"] },
  { recipeId: "milk_onion_pudding", ingredientIds: ["farm:milk","farm:onion"] },
  { recipeId: "fresh_fish_herb_salt_skewer", ingredientIds: ["fishing:catch_fresh","farm:herb","pantry:salt"] },
  { recipeId: "fresh_fish_vinegar_herb_croquette", ingredientIds: ["fishing:catch_fresh","pantry:vinegar","farm:herb"] },
  { recipeId: "sugar_rice_strawberry_medicinal_porridge", ingredientIds: ["farm:sugarcane","farm:rice","farm:strawberry"] },
  { recipeId: "rice_pearl_onion_black_soybean_heirloom_tomato_tonic", ingredientIds: ["farm:rice","farm:pearl_onion","farm:black_soybean","farm:heirloom_tomato"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
