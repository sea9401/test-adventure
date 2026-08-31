import type { CookingExpansionAnswerBatch } from ".";

export const COOKING_EXPANSION_ANSWER_BATCH_32 = {
  id: "32",
  answers: [
  { recipeId: "onion_pepper_flour_stir_fry", ingredientIds: ["farm:onion","pantry:pepper","processed:flour"] },
  { recipeId: "potato_egg_salt_fritter", ingredientIds: ["farm:potato","farm:egg","pantry:salt"] },
  { recipeId: "potato_milk_pork_butter_nutritious_steam", ingredientIds: ["farm:potato","farm:milk","farm:pork","processed:butter"] },
  { recipeId: "tomato_sauce_cheese_onion_broth", ingredientIds: ["farm:tomato","processed:sauce","processed:cheese","farm:onion"] },
  { recipeId: "milk_strawberry_steamed_cake", ingredientIds: ["farm:milk","farm:strawberry"] },
  { recipeId: "cacao_flour_fermented_bread", ingredientIds: ["farm:cacao","processed:flour"] },
  { recipeId: "common_fish_herb_chowder", ingredientIds: ["fishing:catch_common","farm:herb"] },
  { recipeId: "common_fish_vinegar_sauce_fry", ingredientIds: ["fishing:catch_common","pantry:vinegar"] },
  { recipeId: "herb_strawberry_fermented_drink", ingredientIds: ["farm:herb","farm:strawberry"] },
  { recipeId: "sugar_spice_herb_restorative_dish", ingredientIds: ["farm:sugarcane","pantry:spice","farm:herb"] },
  ],
} as const satisfies CookingExpansionAnswerBatch;
