import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_03 = { id: "03", rows: [
  ["tomato_onion_grill", "토마토 양파구이", "hearth", "grill", "🍅", 1],
  ["egg_cheese_fritter", "달걀 치즈튀김", "hearth", "fry", "🧀", 2],
  ["milk_onion_broth", "우유 양파국", "pot", "boil", "🥣", 1],
  ["black_bean_pork_stew", "검은콩 돼지고기 스튜", "pot", "boil", "🫕", 3],
  ["corn_butter_biscuit", "옥수수 버터 비스킷", "baking", "bake", "🍪", 2],
  ["royal_cacao_mousse", "왕실 카카오 무스", "baking", "ferment", "🍫", 3],
  ["salt_fresh_fish_soup", "소금 신선어국", "seafood", "boil", "🍲", 1],
  ["tomato_fish_steam", "토마토 생선찜", "seafood", "steam", "🐟", 2],
  ["strawberry_herb_tea", "딸기 허브차", "medicinal", "brew", "🍓", 1],
  ["pearl_onion_silver_brew", "진주 양파 은빛차", "medicinal", "brew", "🧅", 4],
] } as const satisfies CookingExpansionBatch;
