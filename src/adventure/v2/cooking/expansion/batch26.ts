import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_26 = {
  id: "26",
  rows: [
  ["rice_pepper_flour_pork_fry", "풍작의 쌀 돼지고기 튀김", "hearth", "fry", "🍳", 3],
  ["egg_black_soybean_butter_potato_skewer", "별미 달걀 검은콩 꼬치구이", "hearth", "grill", "🍳", 3],
  ["soybean_cream_nutritious_steam", "바삭한 콩 생크림 영양찜", "pot", "steam", "🍲", 1],
  ["potato_salt_chowder", "부드러운 감자 차우더", "pot", "boil", "🍲", 1],
  ["flour_egg_steamed_cake", "소박한 달걀 증편", "baking", "steam", "🥧", 1],
  ["milk_onion_fermented_bread", "고소한 우유 발효빵", "baking", "ferment", "🥧", 1],
  ["common_fish_soybean_seafood_stew", "담백한 민물생선 콩 해물스튜", "seafood", "boil", "🐟", 1],
  ["fresh_fish_vinegar_herb_fermented_seafood", "진한 신선한생선 허브 발효해물", "seafood", "ferment", "🐟", 2],
  ["soybean_cacao_spice_punch", "노릇한 콩 카카오 펀치", "medicinal", "brew", "🍵", 2],
  ["tomato_soybean_rice_medicinal_pickle", "감칠맛 나는 토마토 콩 약선절임", "medicinal", "ferment", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
