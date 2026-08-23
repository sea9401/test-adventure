import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_18 = {
  id: "18",
  rows: [
  ["rice_pepper_pork_fry", "향긋한 쌀 돼지고기 튀김", "hearth", "fry", "🍳", 2],
  ["egg_broth_soybean_skewer", "풍성한 달걀 콩 꼬치구이", "hearth", "grill", "🍳", 2],
  ["milk_pork_butter_stew", "특제 우유 돼지고기 스튜", "pot", "boil", "🍲", 2],
  ["pork_sauce_cheese_onion_broth", "별미 돼지고기 치즈 탕", "pot", "boil", "🍲", 3],
  ["crystal_sugar_butter_white_strawberry_milk_pork_aged_cream", "수정빛 수정설탕 버터 숙성크림", "baking", "ferment", "🥧", 4],
  ["white_strawberry_crystal_sugar_milk_potato_cream_pudding", "천상의 설향딸기 수정설탕 푸딩", "baking", "steam", "🥧", 5],
  ["common_fish_herb_fritter", "소박한 민물생선 허브 전", "seafood", "fry", "🐟", 1],
  ["common_fish_rice_terrine", "고소한 민물생선 쌀 테린", "seafood", "steam", "🐟", 1],
  ["herb_soybean_herbal_steamed_cake", "담백한 허브 콩 약초증편", "medicinal", "steam", "🍵", 1],
  ["cacao_strawberry_tonic", "따뜻한 카카오 딸기 강장차", "medicinal", "brew", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
