import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_34 = {
  id: "34",
  answers: [
  { recipeId: "pork_herb_fry", ingredientIds: ["farm:pork","farm:herb"] },
  { recipeId: "onion_flour_skewer", ingredientIds: ["farm:onion","processed:flour"] },
  { recipeId: "rice_broth_cheese_soup", ingredientIds: ["farm:rice","processed:broth","processed:cheese"] },
  { recipeId: "pork_sauce_cheese_steam_hotpot", ingredientIds: ["farm:pork","processed:sauce","processed:cheese"] },
  { recipeId: "egg_milk_potato_steamed_cake", ingredientIds: ["farm:egg","farm:milk","farm:potato"] },
  { recipeId: "cacao_flour_yeast_fermented_bread", ingredientIds: ["farm:cacao","processed:flour","pantry:yeast"] },
  { recipeId: "quality_fish_sauce_vinegar_herb_fritter", ingredientIds: ["fishing:catch_quality","processed:sauce","pantry:vinegar","farm:herb"] },
  { recipeId: "special_seafood_soybean_broth_silverleaf_rice_chowder", ingredientIds: ["fishing:catch_special","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "cacao_rice_herbal_steamed_cake", ingredientIds: ["farm:cacao","farm:rice"] },
  { recipeId: "strawberry_tomato_tonic", ingredientIds: ["farm:strawberry","farm:tomato"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
