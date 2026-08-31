import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_09 = {
  id: "09",
  rows: [
  ["pork_corn_pepper_golden_rice_grill", "장인의 돼지고기 옥수수 구이", "hearth", "grill", "🍳", 3],
  ["heirloom_tomato_soybean_salt_potato_butter_fritter", "달빛 고대종토마토 콩 전", "hearth", "fry", "🍳", 4],
  ["golden_rice_heirloom_tomato_butter_milk_salt_broth", "별빛 황금쌀 고대종토마토 탕", "pot", "boil", "🍲", 5],
  ["onion_rice_steam_hotpot", "따뜻한 양파 쌀 찜전골", "pot", "steam", "🍲", 1],
  ["wheat_sugar_aged_cream", "바삭한 밀 숙성크림", "baking", "ferment", "🥧", 1],
  ["milk_onion_gratin", "부드러운 우유 양파 그라탱", "baking", "bake", "🥧", 1],
  ["common_fish_soybean_skillet", "소박한 민물생선 콩 철판볶음", "seafood", "stir_fry", "🐟", 1],
  ["fresh_fish_vinegar_herb_charcoal_grill", "풍성한 신선한생선 허브 숯불구이", "seafood", "grill", "🐟", 2],
  ["sugar_soybean_rice_herbal_steamed_cake", "특제 설탕 콩 약초증편", "medicinal", "steam", "🍵", 2],
  ["rice_herb_cacao_tonic", "진한 쌀 허브 강장차", "medicinal", "brew", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
