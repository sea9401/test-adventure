import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_12 = {
  id: "12",
  rows: [
  ["onion_rice_sauce_fry", "향긋한 양파 쌀 튀김", "hearth", "fry", "🍳", 2],
  ["potato_black_soybean_egg_butter_skillet", "지역 특선 감자 검은콩 철판볶음", "hearth", "stir_fry", "🍳", 3],
  ["pearl_onion_milk_pork_butter_corn_porridge", "은빛 진주양파 우유 죽", "pot", "boil", "🍲", 4],
  ["heirloom_tomato_black_soybean_sauce_cheese_onion_chowder", "황금 고대종토마토 검은콩 차우더", "pot", "boil", "🍲", 5],
  ["flour_egg_aged_cream", "바삭한 달걀 숙성크림", "baking", "ferment", "🥧", 1],
  ["strawberry_pork_cookie", "부드러운 딸기 돼지고기 쿠키", "baking", "bake", "🥧", 1],
  ["common_fish_soybean_fritter", "소박한 민물생선 콩 전", "seafood", "fry", "🐟", 1],
  ["common_fish_vinegar_terrine", "고소한 민물생선 테린", "seafood", "steam", "🐟", 1],
  ["soybean_tomato_herb_medicinal_porridge", "특제 콩 토마토 약선죽", "medicinal", "boil", "🍵", 2],
  ["tomato_sugar_vinegar_restorative_dish", "진한 토마토 설탕 회복식", "medicinal", "steam", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
