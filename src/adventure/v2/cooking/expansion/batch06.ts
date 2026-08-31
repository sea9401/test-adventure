import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_06 = { id: "06", rows: [
  ["egg_butter_scramble", "버터 달걀 스크램블", "hearth", "fry", "🍳", 1],
  ["onion_pork_skewer", "양파 돼지고기 꼬치", "hearth", "grill", "🍢", 2],
  ["corn_milk_porridge", "옥수수 우유죽", "pot", "boil", "🥣", 1],
  ["soy_tomato_hotpot", "콩 토마토 전골", "pot", "boil", "🫕", 3],
  ["cacao_butter_cookie", "카카오 버터 쿠키", "baking", "bake", "🍪", 2],
  ["cheese_pork_pie", "치즈 돼지고기 파이", "baking", "bake", "🥧", 3],
  ["pepper_fish_pan_fry", "후추 생선 지짐", "seafood", "fry", "🐟", 1],
  ["onion_fish_soup", "양파 생선 수프", "seafood", "boil", "🍲", 2],
  ["milk_herb_tea", "우유 허브차", "medicinal", "brew", "🥛", 1],
  ["black_bean_royal_tonic", "검은콩 왕실 강장차", "medicinal", "brew", "☕", 4],
] } as const satisfies CookingExpansionBatch;
