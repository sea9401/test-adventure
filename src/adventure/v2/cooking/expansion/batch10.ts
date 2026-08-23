import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_10 = {
  id: "10",
  rows: [
  ["rice_pepper_fry", "바삭한 쌀 튀김", "hearth", "fry", "🍳", 1],
  ["egg_broth_skewer", "부드러운 달걀 꼬치구이", "hearth", "grill", "🍳", 1],
  ["milk_pork_nutritious_steam", "소박한 우유 돼지고기 영양찜", "pot", "steam", "🍲", 1],
  ["pork_sauce_potage", "고소한 돼지고기 포타주", "pot", "boil", "🍲", 1],
  ["wheat_sugar_butter_steamed_cake", "특제 밀 설탕 증편", "baking", "steam", "🥧", 2],
  ["milk_onion_cheese_fermented_bread", "진한 우유 양파 발효빵", "baking", "ferment", "🥧", 2],
  ["fresh_fish_soybean_broth_skewer", "노릇한 신선한생선 콩 꼬치구이", "seafood", "grill", "🐟", 2],
  ["quality_fish_broth_pearl_onion_tomato_terrine", "대가의 고급생선 진주양파 테린", "seafood", "steam", "🐟", 3],
  ["silverleaf_herb_soybean_tomato_golden_wheat_medicinal_porridge", "왕실 은빛잎 허브 약선죽", "medicinal", "boil", "🍵", 4],
  ["crystal_sugar_white_strawberry_heirloom_tomato_pearl_onion_black_soybean_tonic", "용화 수정설탕 설향딸기 강장차", "medicinal", "brew", "🍵", 5],
  ],
} as const satisfies CookingExpansionBatch;
