import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_23 = {
  id: "23",
  rows: [
  ["pearl_onion_pork_corn_pepper_golden_rice_grill", "은빛 진주양파 돼지고기 구이", "hearth", "grill", "🍳", 4],
  ["soybean_salt_skillet", "따뜻한 콩 철판볶음", "hearth", "stir_fry", "🍳", 1],
  ["corn_soybean_broth", "바삭한 옥수수 콩 탕", "pot", "boil", "🍲", 1],
  ["rice_broth_steam_hotpot", "부드러운 쌀 찜전골", "pot", "steam", "🍲", 1],
  ["wheat_sugar_steamed_cake", "소박한 밀 설탕 증편", "baking", "steam", "🥧", 1],
  ["cacao_flour_yeast_pie", "풍성한 카카오 파이", "baking", "bake", "🥧", 2],
  ["fresh_fish_soybean_broth_fritter", "특제 신선한생선 콩 전", "seafood", "fry", "🐟", 2],
  ["fresh_fish_vinegar_herb_terrine", "진한 신선한생선 허브 테린", "seafood", "steam", "🐟", 2],
  ["sugar_tomato_vinegar_strawberry_medicinal_porridge", "축제의 설탕 토마토 약선죽", "medicinal", "boil", "🍵", 3],
  ["rice_pearl_onion_white_strawberry_royal_cacao_restorative_dish", "대가의 쌀 진주양파 회복식", "medicinal", "steam", "🍵", 3],
  ],
} as const satisfies CookingExpansionBatch;
