import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_31 = {
  id: "31",
  rows: [
  ["potato_oil_fry", "바삭한 감자 튀김", "hearth", "fry", "🍳", 1],
  ["soybean_salt_skewer", "부드러운 콩 꼬치구이", "hearth", "grill", "🍳", 1],
  ["corn_soybean_salt_nutritious_steam", "향긋한 옥수수 콩 영양찜", "pot", "steam", "🍲", 2],
  ["rice_broth_spice_potage", "풍성한 쌀 포타주", "pot", "boil", "🍲", 2],
  ["flour_egg_cacao_steamed_cake", "특제 달걀 카카오 증편", "baking", "steam", "🥧", 2],
  ["milk_flour_yeast_egg_pie", "별미 우유 달걀 파이", "baking", "bake", "🥧", 3],
  ["quality_fish_golden_rice_herb_vinegar_skillet", "축제의 고급생선 황금쌀 철판볶음", "seafood", "stir_fry", "🐟", 3],
  ["common_fish_rice_seafood_hotpot", "부드러운 민물생선 쌀 해물전골", "seafood", "boil", "🐟", 1],
  ["tomato_sugar_punch", "소박한 토마토 설탕 펀치", "medicinal", "brew", "🍵", 1],
  ["strawberry_tomato_medicinal_pickle", "고소한 딸기 토마토 약선절임", "medicinal", "ferment", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
