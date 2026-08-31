import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_24 = {
  id: "24",
  rows: [
  ["onion_pepper_stir_fry", "소박한 양파 볶음", "hearth", "stir_fry", "🍳", 1],
  ["potato_egg_fritter", "고소한 감자 달걀 전", "hearth", "fry", "🍳", 1],
  ["potato_pork_salt_chowder", "특제 감자 돼지고기 차우더", "pot", "boil", "🍲", 2],
  ["tomato_cheese_broth_steam_hotpot", "진한 토마토 치즈 찜전골", "pot", "steam", "🍲", 2],
  ["wheat_sugar_butter_tart", "노릇한 밀 설탕 타르트", "baking", "bake", "🥧", 2],
  ["milk_cacao_flour_strawberry_fermented_bread", "대가의 우유 카카오 발효빵", "baking", "ferment", "🥧", 3],
  ["quality_fish_salt_golden_rice_sauce_clear_broth", "장인의 고급생선 황금쌀 맑은탕", "seafood", "boil", "🐟", 3],
  ["special_seafood_soybean_broth_silverleaf_rice_fermented_seafood", "달빛 특급해산물 콩 발효해물", "seafood", "ferment", "🐟", 4],
  ["tomato_spice_fermented_drink", "담백한 토마토 발효음료", "medicinal", "ferment", "🍵", 1],
  ["strawberry_rice_extract", "따뜻한 딸기 쌀 농축액", "medicinal", "boil", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
