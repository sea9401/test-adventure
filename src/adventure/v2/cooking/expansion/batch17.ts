import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_17 = {
  id: "17",
  rows: [
  ["pork_corn_grill", "담백한 돼지고기 옥수수 구이", "hearth", "grill", "🍳", 1],
  ["tomato_soybean_skillet", "따뜻한 토마토 콩 철판볶음", "hearth", "stir_fry", "🍳", 1],
  ["soybean_butter_chowder", "바삭한 콩 버터 차우더", "pot", "boil", "🍲", 1],
  ["onion_rice_broth_potage", "감칠맛 나는 양파 쌀 포타주", "pot", "boil", "🍲", 2],
  ["flour_egg_cacao_aged_cream", "향긋한 달걀 카카오 숙성크림", "baking", "ferment", "🥧", 2],
  ["milk_onion_cheese_gratin", "풍성한 우유 양파 그라탱", "baking", "bake", "🥧", 2],
  ["quality_fish_herb_salt_onion_seafood_pot_steam", "풍작의 고급생선 허브 해물솥찜", "seafood", "steam", "🐟", 3],
  ["special_seafood_soybean_broth_silverleaf_rice_sauce_fry", "고대의 특급해산물 콩 소스볶음", "seafood", "stir_fry", "🐟", 4],
  ["crystal_sugar_golden_wheat_soybean_cacao_vinegar_medicinal_porridge", "영원의 수정설탕 황금밀 약선죽", "medicinal", "boil", "🍵", 5],
  ["strawberry_soybean_restorative_dish", "부드러운 딸기 콩 회복식", "medicinal", "steam", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
