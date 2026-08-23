import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_17 = {
  id: "17",
  answers: [
  { recipeId: "pork_corn_grill", ingredientIds: ["farm:pork","farm:corn"] },
  { recipeId: "tomato_soybean_skillet", ingredientIds: ["farm:tomato","farm:soybean"] },
  { recipeId: "soybean_butter_chowder", ingredientIds: ["farm:soybean","processed:butter"] },
  { recipeId: "onion_rice_broth_potage", ingredientIds: ["farm:onion","farm:rice","processed:broth"] },
  { recipeId: "flour_egg_cacao_aged_cream", ingredientIds: ["processed:flour","farm:egg","farm:cacao"] },
  { recipeId: "milk_onion_cheese_gratin", ingredientIds: ["farm:milk","farm:onion","processed:cheese"] },
  { recipeId: "quality_fish_herb_salt_onion_seafood_pot_steam", ingredientIds: ["fishing:catch_quality","farm:herb","pantry:salt","farm:onion"] },
  { recipeId: "special_seafood_soybean_broth_silverleaf_rice_sauce_fry", ingredientIds: ["fishing:catch_special","farm:soybean","processed:broth","farm:silverleaf","farm:rice"] },
  { recipeId: "crystal_sugar_golden_wheat_soybean_cacao_vinegar_medicinal_porridge", ingredientIds: ["farm:crystal_sugarcane","farm:golden_wheat","farm:soybean","farm:cacao","pantry:vinegar"] },
  { recipeId: "strawberry_soybean_restorative_dish", ingredientIds: ["farm:strawberry","farm:soybean"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
