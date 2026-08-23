import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_19 = {
  id: "19",
  rows: [
  ["corn_pork_pepper_golden_rice_stir_fry", "축제의 옥수수 돼지고기 볶음", "hearth", "stir_fry", "🍳", 3],
  ["soybean_salt_potato_butter_fritter", "대가의 콩 감자 전", "hearth", "fry", "🍳", 3],
  ["golden_rice_butter_milk_salt_corn_nutritious_steam", "왕실 황금쌀 버터 영양찜", "pot", "steam", "🍲", 4],
  ["soybean_corn_steam_hotpot", "고소한 콩 옥수수 찜전골", "pot", "steam", "🍲", 1],
  ["milk_strawberry_bread", "담백한 우유 딸기 빵", "baking", "bake", "🥧", 1],
  ["strawberry_pork_pudding", "따뜻한 딸기 돼지고기 푸딩", "baking", "steam", "🥧", 1],
  ["common_fish_soybean_seafood_pot_steam", "바삭한 민물생선 콩 해물솥찜", "seafood", "steam", "🐟", 1],
  ["fresh_fish_rice_tomato_sauce_fry", "감칠맛 나는 신선한생선 쌀 소스볶음", "seafood", "stir_fry", "🐟", 2],
  ["soybean_herb_cacao_fermented_drink", "향긋한 콩 허브 발효음료", "medicinal", "ferment", "🍵", 2],
  ["tomato_vinegar_soybean_extract", "풍성한 토마토 콩 농축액", "medicinal", "boil", "🍵", 2],
  ],
} as const satisfies CookingExpansionBatch;
