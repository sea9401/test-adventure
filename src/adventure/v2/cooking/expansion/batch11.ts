import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_11 = {
  id: "11",
  rows: [
  ["corn_sauce_grill", "담백한 옥수수 구이", "hearth", "grill", "🍳", 1],
  ["soybean_tomato_broth_fritter", "진한 콩 토마토 전", "hearth", "fry", "🍳", 2],
  ["corn_cream_butter_nutritious_steam", "노릇한 옥수수 생크림 영양찜", "pot", "steam", "🍲", 2],
  ["rice_onion_sauce_broth", "감칠맛 나는 쌀 양파 탕", "pot", "boil", "🍲", 2],
  ["wheat_potato_butter_crystal_sugar_bread", "장인의 밀 감자 빵", "baking", "bake", "🥧", 3],
  ["crystal_sugar_milk_potato_cream_wheat_fermented_bread", "달빛 수정설탕 우유 발효빵", "baking", "ferment", "🥧", 4],
  ["legendary_seafood_soybean_broth_silverleaf_rice_skillet", "별빛 전설해산물 콩 철판볶음", "seafood", "stir_fry", "🐟", 5],
  ["common_fish_vinegar_croquette", "따뜻한 민물생선 크로켓", "seafood", "fry", "🐟", 1],
  ["herb_vinegar_punch", "바삭한 허브 펀치", "medicinal", "brew", "🍵", 1],
  ["sugar_tomato_medicinal_pickle", "부드러운 설탕 토마토 약선절임", "medicinal", "ferment", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
