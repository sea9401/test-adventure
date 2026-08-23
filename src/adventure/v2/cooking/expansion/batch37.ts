import type { CookingExpansionBatch } from "./types";

export const COOKING_EXPANSION_BATCH_37 = {
  id: "37",
  rows: [
  ["egg_oil_fry", "바삭한 달걀 튀김", "hearth", "fry", "🍳", 1],
  ["potato_egg_skewer", "부드러운 감자 달걀 꼬치구이", "hearth", "grill", "🍳", 1],
  ["pork_herb_broth", "소박한 돼지고기 허브 탕", "pot", "boil", "🍲", 1],
  ["corn_butter_pork_hotpot", "풍성한 옥수수 버터 전골", "pot", "boil", "🍲", 2],
  ["milk_strawberry_onion_steamed_cake", "특제 우유 딸기 증편", "baking", "steam", "🥧", 2],
  ["wheat_butter_potato_fermented_bread", "진한 밀 버터 발효빵", "baking", "ferment", "🥧", 2],
  ["fresh_fish_herb_salt_potage", "노릇한 신선한생선 허브 포타주", "seafood", "boil", "🐟", 2],
  ["quality_fish_broth_pearl_onion_tomato_fermented_seafood", "대가의 고급생선 진주양파 발효해물", "seafood", "ferment", "🐟", 3],
  ["silverleaf_herb_soybean_tomato_golden_wheat_fermented_drink", "왕실 은빛잎 허브 발효음료", "medicinal", "ferment", "🍵", 4],
  ["rice_vinegar_restorative_dish", "고소한 쌀 회복식", "medicinal", "steam", "🍵", 1],
  ],
} as const satisfies CookingExpansionBatch;
