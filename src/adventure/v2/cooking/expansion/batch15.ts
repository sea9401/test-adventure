import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_15 = {
  id: "15",
  rows: [
  ["corn_herb_flour_fry", "향긋한 옥수수 허브 튀김", "hearth", "fry", "🍳", 2],
  ["soybean_salt_butter_skewer", "풍성한 콩 버터 꼬치구이", "hearth", "grill", "🍳", 2],
  ["corn_butter_golden_rice_milk_potage", "풍작의 옥수수 버터 포타주", "pot", "boil", "🍲", 3],
  ["black_soybean_onion_rice_sauce_heirloom_tomato_soup", "고대의 검은콩 양파 수프", "pot", "boil", "🍲", 4],
  ["white_strawberry_royal_cacao_crystal_sugar_milk_pork_bread", "영원의 설향딸기 왕실카카오 빵", "baking", "bake", "🥧", 5],
  ["cacao_flour_pie", "부드러운 카카오 파이", "baking", "bake", "🥧", 1],
  ["common_fish_herb_skillet", "소박한 민물생선 허브 철판볶음", "seafood", "stir_fry", "🐟", 1],
  ["common_fish_rice_fermented_seafood", "고소한 민물생선 쌀 발효해물", "seafood", "ferment", "🐟", 1],
  ["strawberry_spice_punch", "담백한 딸기 펀치", "medicinal", "brew", "🍵", 1],
  ["cacao_rice_strawberry_extract", "진한 카카오 쌀 농축액", "medicinal", "boil", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
