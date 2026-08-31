import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_14 = {
  id: "14",
  rows: [
  ["rice_flour_grill", "담백한 쌀 구이", "hearth", "grill", "🍳", 1],
  ["egg_potato_skillet", "따뜻한 달걀 감자 철판볶음", "hearth", "stir_fry", "🍳", 1],
  ["milk_salt_potato_hotpot", "노릇한 우유 감자 전골", "pot", "boil", "🍲", 2],
  ["pork_tomato_herb_steam_hotpot", "감칠맛 나는 돼지고기 토마토 찜전골", "pot", "steam", "🍲", 2],
  ["wheat_sugar_butter_aged_cream", "향긋한 밀 설탕 숙성크림", "baking", "ferment", "🥧", 2],
  ["milk_onion_cheese_golden_wheat_pudding", "지역 특선 우유 양파 푸딩", "baking", "steam", "🥧", 3],
  ["special_seafood_soybean_broth_silverleaf_rice_skewer", "은빛 특급해산물 콩 꼬치구이", "seafood", "grill", "🐟", 4],
  ["legendary_seafood_soybean_broth_silverleaf_rice_terrine", "황금 전설해산물 콩 테린", "seafood", "steam", "🐟", 5],
  ["rice_strawberry_herbal_steamed_cake", "바삭한 쌀 딸기 약초증편", "medicinal", "steam", "🍵", 1],
  ["soybean_spice_tonic", "부드러운 콩 강장차", "medicinal", "brew", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
