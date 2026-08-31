import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_20 = {
  id: "20",
  rows: [
  ["onion_rice_grill", "담백한 양파 쌀 구이", "hearth", "grill", "🍳", 1],
  ["potato_oil_skillet", "따뜻한 감자 철판볶음", "hearth", "stir_fry", "🍳", 1],
  ["potato_milk_nutritious_steam", "바삭한 감자 우유 영양찜", "pot", "steam", "🍲", 1],
  ["tomato_herb_stew", "부드러운 토마토 허브 스튜", "pot", "boil", "🍲", 1],
  ["egg_milk_potato_aged_cream", "향긋한 달걀 우유 숙성크림", "baking", "ferment", "🥧", 2],
  ["strawberry_pork_cream_cookie", "풍성한 딸기 돼지고기 쿠키", "baking", "bake", "🥧", 2],
  ["fresh_fish_soybean_broth_skillet", "특제 신선한생선 콩 철판볶음", "seafood", "stir_fry", "🐟", 2],
  ["quality_fish_tomato_oil_soybean_charcoal_grill", "별미 고급생선 토마토 숯불구이", "seafood", "grill", "🐟", 3],
  ["cacao_golden_wheat_strawberry_vinegar_herbal_steamed_cake", "축제의 카카오 황금밀 약초증편", "medicinal", "steam", "🍵", 3],
  ["golden_rice_black_soybean_royal_cacao_spice_white_strawberry_medicinal_pickle", "비전의 황금쌀 검은콩 약선절임", "medicinal", "ferment", "🍵", 4],
  ],
} as const satisfies CookingExpansionBatch;
