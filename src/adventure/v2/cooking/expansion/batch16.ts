import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_16 = {
  id: "16",
  rows: [
  ["golden_rice_pepper_flour_pork_herb_fry", "수정빛 황금쌀 돼지고기 튀김", "hearth", "fry", "🍳", 4],
  ["black_soybean_heirloom_tomato_egg_butter_potato_skillet", "천상의 검은콩 고대종토마토 철판볶음", "hearth", "stir_fry", "🍳", 5],
  ["potato_pork_nutritious_steam", "소박한 감자 돼지고기 영양찜", "pot", "steam", "🍲", 1],
  ["tomato_cheese_hotpot", "고소한 토마토 치즈 전골", "pot", "boil", "🍲", 1],
  ["egg_milk_tart", "담백한 달걀 우유 타르트", "baking", "bake", "🥧", 1],
  ["milk_onion_pudding", "따뜻한 우유 양파 푸딩", "baking", "steam", "🥧", 1],
  ["fresh_fish_herb_salt_skewer", "노릇한 신선한생선 허브 꼬치구이", "seafood", "grill", "🐟", 2],
  ["fresh_fish_vinegar_herb_croquette", "감칠맛 나는 신선한생선 허브 크로켓", "seafood", "fry", "🐟", 2],
  ["sugar_rice_strawberry_medicinal_porridge", "향긋한 설탕 쌀 약선죽", "medicinal", "boil", "🍵", 2],
  ["rice_pearl_onion_black_soybean_heirloom_tomato_tonic", "지역 특선 쌀 진주양파 강장차", "medicinal", "brew", "🍵", 3],
  ],
} as const satisfies CookingExpansionBatch;
