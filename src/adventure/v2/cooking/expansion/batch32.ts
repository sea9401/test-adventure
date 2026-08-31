import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_32 = {
  id: "32",
  rows: [
  ["onion_pepper_flour_stir_fry", "특제 양파 볶음", "hearth", "stir_fry", "🍳", 2],
  ["potato_egg_salt_fritter", "진한 감자 달걀 전", "hearth", "fry", "🍳", 2],
  ["potato_milk_pork_butter_nutritious_steam", "축제의 감자 우유 영양찜", "pot", "steam", "🍲", 3],
  ["tomato_sauce_cheese_onion_broth", "대가의 토마토 치즈 탕", "pot", "boil", "🍲", 3],
  ["milk_strawberry_steamed_cake", "소박한 우유 딸기 증편", "baking", "steam", "🥧", 1],
  ["cacao_flour_fermented_bread", "고소한 카카오 발효빵", "baking", "ferment", "🥧", 1],
  ["common_fish_herb_chowder", "담백한 민물생선 허브 차우더", "seafood", "boil", "🐟", 1],
  ["common_fish_vinegar_sauce_fry", "새콤한 민물생선 볶음", "seafood", "stir_fry", "🐟", 1],
  ["herb_strawberry_fermented_drink", "바삭한 허브 딸기 발효음료", "medicinal", "ferment", "🍵", 1],
  ["sugar_spice_herb_restorative_dish", "감칠맛 나는 설탕 허브 회복식", "medicinal", "steam", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
