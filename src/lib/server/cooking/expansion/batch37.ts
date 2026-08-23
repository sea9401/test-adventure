import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_37 = {
  id: "37",
  answers: [
  { recipeId: "egg_oil_fry", ingredientIds: ["farm:egg","pantry:oil"] },
  { recipeId: "potato_egg_skewer", ingredientIds: ["farm:potato","farm:egg"] },
  { recipeId: "pork_herb_broth", ingredientIds: ["farm:pork","farm:herb"] },
  { recipeId: "corn_butter_pork_hotpot", ingredientIds: ["farm:corn","processed:butter","farm:pork"] },
  { recipeId: "milk_strawberry_onion_steamed_cake", ingredientIds: ["farm:milk","farm:strawberry","farm:onion"] },
  { recipeId: "wheat_butter_potato_fermented_bread", ingredientIds: ["farm:wheat","processed:butter","farm:potato"] },
  { recipeId: "fresh_fish_herb_salt_potage", ingredientIds: ["fishing:catch_fresh","farm:herb","pantry:salt"] },
  { recipeId: "quality_fish_broth_pearl_onion_tomato_fermented_seafood", ingredientIds: ["fishing:catch_quality","processed:broth","farm:pearl_onion","farm:tomato"] },
  { recipeId: "silverleaf_herb_soybean_tomato_golden_wheat_fermented_drink", ingredientIds: ["farm:silverleaf","farm:herb","farm:soybean","farm:tomato","farm:golden_wheat"] },
  { recipeId: "rice_vinegar_restorative_dish", ingredientIds: ["farm:rice","pantry:vinegar"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
