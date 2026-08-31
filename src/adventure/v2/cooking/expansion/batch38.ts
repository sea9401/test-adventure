import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_38 = {
  id: "38",
  rows: [
  ["rice_flour_onion_stir_fry", "특제 쌀 양파 볶음", "hearth", "stir_fry", "🍳", 2],
  ["egg_potato_oil_fritter", "진한 달걀 감자 전", "hearth", "fry", "🍳", 2],
  ["rice_spice_onion_chowder", "노릇한 쌀 양파 차우더", "pot", "boil", "🍲", 2],
  ["potato_milk_pork_steam_hotpot", "감칠맛 나는 감자 우유 찜전골", "pot", "steam", "🍲", 2],
  ["flour_onion_cheese_golden_wheat_biscuit", "장인의 양파 치즈 비스킷", "baking", "bake", "🥧", 3],
  ["crystal_sugar_white_strawberry_wheat_potato_cream_fermented_bread", "달빛 수정설탕 설향딸기 발효빵", "baking", "ferment", "🥧", 4],
  ["common_fish_tomato_clear_broth", "담백한 민물생선 토마토 맑은탕", "seafood", "boil", "🐟", 1],
  ["common_fish_rice_sauce_fry", "따뜻한 민물생선 소스볶음", "seafood", "stir_fry", "🐟", 1],
  ["tomato_vinegar_herbal_steamed_cake", "바삭한 토마토 약초증편", "medicinal", "steam", "🍵", 1],
  ["soybean_rice_tonic", "부드러운 콩 쌀 강장차", "medicinal", "brew", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
