import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_01 = {
  id: "01",
  rows: [
    ["pepper_pork_grill", "후추 돼지고기구이", "hearth", "grill", "🥩", 1],
    ["tomato_cheese_skillet", "토마토 치즈 철판볶음", "hearth", "stir_fry", "🍅", 2],
    ["butter_potato_mash", "버터 감자 으깸", "pot", "boil", "🥔", 1],
    ["pork_onion_broth", "돼지고기 양파탕", "pot", "boil", "🍲", 3],
    ["butter_toast", "고소한 버터 토스트", "baking", "bake", "🍞", 1],
    ["strawberry_cream_cake", "딸기 생크림 케이크", "baking", "bake", "🍰", 3],
    ["pepper_fresh_fish", "후추 생선구이", "seafood", "grill", "🐟", 1],
    ["vinegar_cured_fish", "새콤한 숙성 생선", "seafood", "ferment", "🍣", 2],
    ["soybean_herb_tea", "콩 허브차", "medicinal", "brew", "🍵", 2],
    ["silverleaf_crystal_tonic", "은빛 수정 강장차", "medicinal", "brew", "🧪", 4],
  ],
} as const satisfies CookingExpansionBatch;
