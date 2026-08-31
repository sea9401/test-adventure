import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_23 = {
  id: "23",
  answers: [
  { recipeId: "pearl_onion_pork_corn_pepper_golden_rice_grill", ingredientIds: ["farm:pearl_onion","farm:pork","farm:corn","pantry:pepper","farm:golden_rice"] },
  { recipeId: "soybean_salt_skillet", ingredientIds: ["farm:soybean","pantry:salt"] },
  { recipeId: "corn_soybean_broth", ingredientIds: ["farm:corn","farm:soybean"] },
  { recipeId: "rice_broth_steam_hotpot", ingredientIds: ["farm:rice","processed:broth"] },
  { recipeId: "wheat_sugar_steamed_cake", ingredientIds: ["farm:wheat","farm:sugarcane"] },
  { recipeId: "cacao_flour_yeast_pie", ingredientIds: ["farm:cacao","processed:flour","pantry:yeast"] },
  { recipeId: "fresh_fish_soybean_broth_fritter", ingredientIds: ["fishing:catch_fresh","farm:soybean","processed:broth"] },
  { recipeId: "fresh_fish_vinegar_herb_terrine", ingredientIds: ["fishing:catch_fresh","pantry:vinegar","farm:herb"] },
  { recipeId: "sugar_tomato_vinegar_strawberry_medicinal_porridge", ingredientIds: ["farm:sugarcane","farm:tomato","pantry:vinegar","farm:strawberry"] },
  { recipeId: "rice_pearl_onion_white_strawberry_royal_cacao_restorative_dish", ingredientIds: ["farm:rice","farm:pearl_onion","farm:white_strawberry","farm:royal_cacao"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
