import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_28 = {
  id: "28",
  answers: [
  { recipeId: "onion_rice_fry", ingredientIds: ["farm:onion","farm:rice"] },
  { recipeId: "potato_oil_broth_skillet", ingredientIds: ["farm:potato","pantry:oil","processed:broth"] },
  { recipeId: "potato_milk_cream_hotpot", ingredientIds: ["farm:potato","farm:milk","processed:cream"] },
  { recipeId: "tomato_herb_sauce_steam_hotpot", ingredientIds: ["farm:tomato","farm:herb","processed:sauce"] },
  { recipeId: "wheat_pork_cream_potato_aged_cream", ingredientIds: ["farm:wheat","farm:pork","processed:cream","farm:potato"] },
  { recipeId: "milk_royal_cacao_egg_onion_cookie", ingredientIds: ["farm:milk","farm:royal_cacao","farm:egg","farm:onion"] },
  { recipeId: "common_fish_herb_fish_pickle", ingredientIds: ["fishing:catch_common","farm:herb"] },
  { recipeId: "common_fish_rice_charcoal_grill", ingredientIds: ["fishing:catch_common","farm:rice"] },
  { recipeId: "rice_herb_fermented_drink", ingredientIds: ["farm:rice","farm:herb"] },
  { recipeId: "soybean_vinegar_extract", ingredientIds: ["farm:soybean","pantry:vinegar"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
