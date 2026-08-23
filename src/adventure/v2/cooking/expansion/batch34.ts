import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_34 = {
  id: "34",
  rows: [
  ["pork_herb_fry", "바삭한 돼지고기 허브 튀김", "hearth", "fry", "🍳", 1],
  ["onion_flour_skewer", "부드러운 양파 꼬치구이", "hearth", "grill", "🍳", 1],
  ["rice_broth_cheese_soup", "향긋한 쌀 치즈 수프", "pot", "boil", "🍲", 2],
  ["pork_sauce_cheese_steam_hotpot", "풍성한 돼지고기 치즈 찜전골", "pot", "steam", "🍲", 2],
  ["egg_milk_potato_steamed_cake", "특제 달걀 우유 증편", "baking", "steam", "🥧", 2],
  ["cacao_flour_yeast_fermented_bread", "진한 카카오 발효빵", "baking", "ferment", "🥧", 2],
  ["quality_fish_sauce_vinegar_herb_fritter", "축제의 고급생선 허브 전", "seafood", "fry", "🐟", 3],
  ["special_seafood_soybean_broth_silverleaf_rice_chowder", "비전의 특급해산물 콩 차우더", "seafood", "boil", "🐟", 4],
  ["cacao_rice_herbal_steamed_cake", "소박한 카카오 쌀 약초증편", "medicinal", "steam", "🍵", 1],
  ["strawberry_tomato_tonic", "고소한 딸기 토마토 강장차", "medicinal", "brew", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
