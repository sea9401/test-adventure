import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_08 = { id: "08", rows: [
  ["pork_oil_grill", "기름 바른 돼지고기구이", "hearth", "grill", "🍖", 1],
  ["tomato_pork_fry", "토마토 돼지고기튀김", "hearth", "fry", "🍅", 2],
  ["onion_broth_soup", "맑은 양파 육수", "pot", "boil", "🧅", 1],
  ["blackbean_rice_stew", "검은콩 쌀 스튜", "pot", "boil", "🫘", 3],
  ["strawberry_yeast_bread", "딸기 발효빵", "baking", "bake", "🍞", 2],
  ["royal_cacao_cheesecake", "왕실 카카오 치즈케이크", "baking", "bake", "🍰", 3],
  ["vinegar_quality_cure", "고급 생선 초절임", "seafood", "ferment", "🍣", 1],
  ["corn_fish_fritter", "옥수수 생선튀김", "seafood", "fry", "🐟", 2],
  ["tomato_herb_tea", "토마토 허브차", "medicinal", "brew", "🍅", 1],
  ["pearl_onion_night_tonic", "진주 양파 밤의 영약", "medicinal", "ferment", "🌙", 4],
] } as const satisfies CookingExpansionBatch;
