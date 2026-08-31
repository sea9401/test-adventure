import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_25 = {
  id: "25",
  rows: [
  ["pork_corn_pepper_grill", "노릇한 돼지고기 옥수수 구이", "hearth", "grill", "🍳", 2],
  ["tomato_soybean_salt_skillet", "감칠맛 나는 토마토 콩 철판볶음", "hearth", "stir_fry", "🍳", 2],
  ["soybean_butter_corn_nutritious_steam", "향긋한 콩 버터 영양찜", "pot", "steam", "🍲", 2],
  ["onion_rice_sauce_heirloom_tomato_steam_hotpot", "지역 특선 양파 쌀 찜전골", "pot", "steam", "🍲", 3],
  ["wheat_white_strawberry_potato_cream_aged_cream", "풍작의 밀 설향딸기 숙성크림", "baking", "ferment", "🥧", 3],
  ["wheat_butter_pudding", "따뜻한 밀 버터 푸딩", "baking", "steam", "🥧", 1],
  ["common_fish_herb_seafood_pot_steam", "바삭한 민물생선 허브 해물솥찜", "seafood", "steam", "🐟", 1],
  ["common_fish_vinegar_potage", "부드러운 민물생선 포타주", "seafood", "boil", "🐟", 1],
  ["strawberry_vinegar_medicinal_porridge", "소박한 딸기 약선죽", "medicinal", "boil", "🍵", 1],
  ["sugar_cacao_restorative_dish", "고소한 설탕 카카오 회복식", "medicinal", "steam", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
