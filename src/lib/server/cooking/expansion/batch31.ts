import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_31 = {
  id: "31",
  answers: [
  { recipeId: "potato_oil_fry", ingredientIds: ["farm:potato","pantry:oil"] },
  { recipeId: "soybean_salt_skewer", ingredientIds: ["farm:soybean","pantry:salt"] },
  { recipeId: "corn_soybean_salt_nutritious_steam", ingredientIds: ["farm:corn","farm:soybean","pantry:salt"] },
  { recipeId: "rice_broth_spice_potage", ingredientIds: ["farm:rice","processed:broth","pantry:spice"] },
  { recipeId: "flour_egg_cacao_steamed_cake", ingredientIds: ["processed:flour","farm:egg","farm:cacao"] },
  { recipeId: "milk_flour_yeast_egg_pie", ingredientIds: ["farm:milk","processed:flour","pantry:yeast","farm:egg"] },
  { recipeId: "quality_fish_golden_rice_herb_vinegar_skillet", ingredientIds: ["fishing:catch_quality","farm:golden_rice","farm:herb","pantry:vinegar"] },
  { recipeId: "common_fish_rice_seafood_hotpot", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "tomato_sugar_punch", ingredientIds: ["farm:tomato","farm:sugarcane"] },
  { recipeId: "strawberry_tomato_medicinal_pickle", ingredientIds: ["farm:strawberry","farm:tomato"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
