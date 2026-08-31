import type { CookingExpansionBatch } from "./types";
export const COOKING_EXPANSION_BATCH_07 = { id: "07", rows: [
  ["tomato_egg_grill", "토마토 달걀구이", "hearth", "grill", "🍳", 1],
  ["cheese_corn_skewer", "치즈 옥수수 꼬치", "hearth", "grill", "🌽", 2],
  ["potato_milk_broth", "감자 우유국", "pot", "boil", "🥣", 1],
  ["pork_rice_gumbo", "돼지고기 쌀 검보", "pot", "boil", "🥘", 3],
  ["milk_butter_biscuit", "우유 버터 비스킷", "baking", "bake", "🍪", 2],
  ["whiteberry_cream_tart", "설향 생크림 타르트", "baking", "bake", "🥧", 3],
  ["salt_quality_fish_grill", "고급 소금 생선구이", "seafood", "grill", "🐟", 1],
  ["tomato_cured_fish", "토마토 숙성 생선", "seafood", "ferment", "🍣", 2],
  ["soybean_milk_tea", "콩 밀크티", "medicinal", "brew", "🍵", 1],
  ["golden_wheat_sun_brew", "황금 밀 햇살차", "medicinal", "brew", "☀️", 4],
] } as const satisfies CookingExpansionBatch;
