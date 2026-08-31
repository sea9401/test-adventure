import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_30 = {
  id: "30",
  rows: [
  ["rice_flour_stir_fry", "소박한 쌀 볶음", "hearth", "stir_fry", "🍳", 1],
  ["corn_herb_fritter", "고소한 옥수수 허브 전", "hearth", "fry", "🍳", 1],
  ["milk_salt_nutritious_steam", "담백한 우유 영양찜", "pot", "steam", "🍲", 1],
  ["pork_tomato_hotpot", "따뜻한 돼지고기 토마토 전골", "pot", "boil", "🍲", 1],
  ["egg_milk_aged_cream", "바삭한 우유 숙성크림", "baking", "ferment", "🥧", 1],
  ["strawberry_pork_cream_pudding", "감칠맛 나는 딸기 돼지고기 푸딩", "baking", "steam", "🥧", 2],
  ["fresh_fish_soybean_broth_seafood_pot_steam", "향긋한 신선한생선 콩 해물솥찜", "seafood", "steam", "🐟", 2],
  ["fresh_fish_vinegar_herb_fish_soup", "풍성한 신선한생선 허브 생선탕", "seafood", "boil", "🐟", 2],
  ["sugar_vinegar_herb_rice_fermented_drink", "풍작의 설탕 허브 발효음료", "medicinal", "ferment", "🍵", 3],
  ["rice_white_strawberry_crystal_sugar_silverleaf_extract", "별미 쌀 설향딸기 농축액", "medicinal", "boil", "🍵", 3],
  ],
} as const satisfies CookingExpansionBatch;
