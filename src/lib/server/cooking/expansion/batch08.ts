import type { CookingExpansionAnswerBatch } from ".";
export const COOKING_EXPANSION_ANSWER_BATCH_08 = { id: "08", answers: [
  { recipeId: "pork_oil_grill", ingredientIds: ["farm:pork", "pantry:oil"] },
  { recipeId: "tomato_pork_fry", ingredientIds: ["farm:tomato", "farm:pork", "pantry:oil"] },
  { recipeId: "onion_broth_soup", ingredientIds: ["farm:onion", "processed:broth"] },
  { recipeId: "blackbean_rice_stew", ingredientIds: ["farm:black_soybean", "farm:rice", "processed:broth", "pantry:pepper"] },
  { recipeId: "strawberry_yeast_bread", ingredientIds: ["farm:strawberry", "pantry:yeast", "processed:flour"] },
  { recipeId: "royal_cacao_cheesecake", ingredientIds: ["farm:royal_cacao", "processed:cheese", "processed:cream", "processed:flour"] },
  { recipeId: "vinegar_quality_cure", ingredientIds: ["fishing:catch_quality", "pantry:vinegar"] },
  { recipeId: "corn_fish_fritter", ingredientIds: ["fishing:catch_common", "farm:corn", "pantry:oil"] },
  { recipeId: "tomato_herb_tea", ingredientIds: ["farm:tomato", "farm:herb"] },
  { recipeId: "pearl_onion_night_tonic", ingredientIds: ["farm:pearl_onion", "farm:black_soybean", "farm:silverleaf", "farm:crystal_sugarcane", "pantry:vinegar"] },
] } as const satisfies CookingExpansionAnswerBatch;
