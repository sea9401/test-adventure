import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_02 = { id: "02", rows: [
  ["onion_egg_scramble", "양파 달걀 스크램블", "hearth", "fry", "🍳", 1],
  ["soy_pork_stir_fry", "콩 돼지고기볶음", "hearth", "stir_fry", "🥘", 2],
  ["corn_potato_soup", "옥수수 감자국", "pot", "boil", "🍲", 1],
  ["tomato_rice_stew", "토마토 쌀 스튜", "pot", "boil", "🥣", 3],
  ["strawberry_scone", "딸기 버터 스콘", "baking", "bake", "🥮", 2],
  ["cacao_cream_roll", "카카오 생크림 롤", "baking", "bake", "🍰", 3],
  ["oil_grilled_fresh_fish", "기름 바른 신선어 구이", "seafood", "grill", "🐟", 1],
  ["soy_steamed_fish", "콩 향 생선찜", "seafood", "steam", "🍣", 2],
  ["silverleaf_milk_tea", "은빛잎 밀크티", "medicinal", "brew", "🍵", 1],
  ["golden_rice_elixir", "황금 쌀 영약", "medicinal", "ferment", "🍶", 4],
] } as const satisfies CookingExpansionBatch;
