import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_05 = { id: "05", rows: [
  ["butter_onion_grill", "버터 양파구이", "hearth", "grill", "🧅", 1],
  ["pork_egg_fry", "돼지고기 달걀튀김", "hearth", "fry", "🍖", 2],
  ["tomato_rice_soup", "토마토 쌀국", "pot", "boil", "🍅", 1],
  ["cheese_corn_stew", "치즈 옥수수 스튜", "pot", "boil", "🫕", 3],
  ["potato_cheese_bake", "감자 치즈 오븐구이", "baking", "bake", "🥔", 2],
  ["strawberry_custard_tart", "딸기 커스터드 타르트", "baking", "bake", "🥧", 3],
  ["oil_common_fish_fry", "담백한 생선 지짐", "seafood", "fry", "🐟", 1],
  ["herb_fish_broth", "허브 생선탕", "seafood", "boil", "🍲", 2],
  ["silverleaf_sugar_tea", "은빛잎 단차", "medicinal", "brew", "🍵", 1],
  ["ancient_tomato_elixir", "고대 토마토 영약", "medicinal", "ferment", "🧪", 4],
] } as const satisfies CookingExpansionBatch;
