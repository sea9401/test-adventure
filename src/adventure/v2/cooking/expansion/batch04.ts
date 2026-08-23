import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_04 = { id: "04", rows: [
  ["salted_onion_grill", "소금 양파구이", "hearth", "grill", "🧅", 1],
  ["corn_egg_fritter", "옥수수 달걀튀김", "hearth", "fry", "🌽", 2],
  ["soybean_rice_porridge", "콩 쌀죽", "pot", "boil", "🍚", 1],
  ["cream_pork_chowder", "돼지고기 크림 차우더", "pot", "boil", "🥣", 3],
  ["cheese_onion_bread", "치즈 양파빵", "baking", "bake", "🍞", 2],
  ["cacao_butter_cake", "카카오 버터 케이크", "baking", "bake", "🍰", 3],
  ["vinegar_common_cure", "식초 숙성 생선", "seafood", "ferment", "🍣", 1],
  ["fish_rice_ball", "생선 초밥 주먹밥", "seafood", "steam", "🍙", 2],
  ["cacao_herb_brew", "카카오 허브차", "medicinal", "brew", "☕", 1],
  ["whiteberry_moon_tea", "설향 달빛차", "medicinal", "brew", "🌙", 4],
] } as const satisfies CookingExpansionBatch;
