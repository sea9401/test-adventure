import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_28 = {
  id: "28",
  rows: [
  ["onion_rice_fry", "바삭한 양파 쌀 튀김", "hearth", "fry", "🍳", 1],
  ["potato_oil_broth_skillet", "감칠맛 나는 감자 철판볶음", "hearth", "stir_fry", "🍳", 2],
  ["potato_milk_cream_hotpot", "향긋한 감자 우유 전골", "pot", "boil", "🍲", 2],
  ["tomato_herb_sauce_steam_hotpot", "풍성한 토마토 허브 찜전골", "pot", "steam", "🍲", 2],
  ["wheat_pork_cream_potato_aged_cream", "풍작의 밀 돼지고기 숙성크림", "baking", "ferment", "🥧", 3],
  ["milk_royal_cacao_egg_onion_cookie", "별미 우유 왕실카카오 쿠키", "baking", "bake", "🥧", 3],
  ["common_fish_herb_fish_pickle", "바삭한 민물생선 허브 생선절임", "seafood", "ferment", "🐟", 1],
  ["common_fish_rice_charcoal_grill", "부드러운 민물생선 쌀 숯불구이", "seafood", "grill", "🐟", 1],
  ["rice_herb_fermented_drink", "소박한 쌀 허브 발효음료", "medicinal", "ferment", "🍵", 1],
  ["soybean_vinegar_extract", "고소한 콩 농축액", "medicinal", "boil", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
