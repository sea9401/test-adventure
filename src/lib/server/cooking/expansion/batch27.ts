import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_27 = {
  id: "27",
  answers: [
  { recipeId: "corn_sauce_stir_fry", ingredientIds: ["farm:corn","processed:sauce"] },
  { recipeId: "soybean_tomato_fritter", ingredientIds: ["farm:soybean","farm:tomato"] },
  { recipeId: "corn_cream_soup_27", ingredientIds: ["farm:corn","processed:cream"] },
  { recipeId: "pork_tomato_steam_hotpot", ingredientIds: ["farm:pork","farm:tomato"] },
  { recipeId: "flour_egg_cacao_bread", ingredientIds: ["processed:flour","farm:egg","farm:cacao"] },
  { recipeId: "milk_onion_cheese_pudding", ingredientIds: ["farm:milk","farm:onion","processed:cheese"] },
  { recipeId: "fresh_fish_soybean_broth_fish_pickle", ingredientIds: ["fishing:catch_fresh","farm:soybean","processed:broth"] },
  { recipeId: "quality_fish_oil_silverleaf_rice_croquette", ingredientIds: ["fishing:catch_quality","pantry:oil","farm:silverleaf","farm:rice"] },
  { recipeId: "cacao_strawberry_sugar_rice_medicinal_porridge", ingredientIds: ["farm:cacao","farm:strawberry","farm:sugarcane","farm:rice"] },
  { recipeId: "herb_cacao_medicinal_pickle", ingredientIds: ["farm:herb","farm:cacao"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
