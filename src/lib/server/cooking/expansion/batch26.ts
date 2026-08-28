import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_26 = {
  id: "26",
  answers: [
  { recipeId: "rice_pepper_flour_pork_fry", ingredientIds: ["farm:rice","pantry:pepper","processed:flour","farm:pork"] },
  { recipeId: "egg_black_soybean_butter_potato_skewer", ingredientIds: ["farm:egg","farm:black_soybean","processed:butter","farm:potato"] },
  { recipeId: "soybean_cream_nutritious_steam", ingredientIds: ["farm:soybean","processed:cream"] },
  { recipeId: "potato_salt_chowder", ingredientIds: ["farm:potato","pantry:salt"] },
  { recipeId: "flour_egg_steamed_cake", ingredientIds: ["processed:flour","farm:egg"] },
  { recipeId: "milk_onion_fermented_bread", ingredientIds: ["farm:milk","processed:flour"] },
  { recipeId: "common_fish_soybean_seafood_stew", ingredientIds: ["fishing:catch_common","farm:soybean"] },
  { recipeId: "fresh_fish_vinegar_herb_fermented_seafood", ingredientIds: ["fishing:catch_fresh","pantry:vinegar","farm:herb"] },
  { recipeId: "soybean_cacao_spice_punch", ingredientIds: ["farm:soybean","farm:cacao","pantry:spice"] },
  { recipeId: "tomato_soybean_rice_medicinal_pickle", ingredientIds: ["farm:tomato","farm:soybean","farm:rice"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
