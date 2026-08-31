import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_21 = {
  id: "21",
  rows: [
  ["pork_herb_stir_fry", "소박한 돼지고기 허브 볶음", "hearth", "stir_fry", "🍳", 1],
  ["tomato_butter_oil_skewer", "풍성한 토마토 버터 꼬치구이", "hearth", "grill", "🍳", 2],
  ["soybean_cream_potato_nutritious_steam", "특제 콩 생크림 영양찜", "pot", "steam", "🍲", 2],
  ["onion_spice_herb_porridge", "진한 양파 허브 죽", "pot", "boil", "🍲", 2],
  ["wheat_sugar_pork_white_strawberry_steamed_cake", "축제의 밀 설탕 증편", "baking", "steam", "🥧", 3],
  ["milk_cheese_royal_cacao_strawberry_fermented_bread", "대가의 우유 치즈 발효빵", "baking", "ferment", "🥧", 3],
  ["special_seafood_soybean_broth_silverleaf_rice_fritter", "왕실 특급해산물 콩 전", "seafood", "fry", "🐟", 4],
  ["common_fish_onion_fermented_seafood", "고소한 민물생선 양파 발효해물", "seafood", "ferment", "🐟", 1],
  ["herb_rice_medicinal_porridge", "담백한 허브 쌀 약선죽", "medicinal", "boil", "🍵", 1],
  ["soybean_sugar_restorative_dish", "따뜻한 콩 설탕 회복식", "medicinal", "steam", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
