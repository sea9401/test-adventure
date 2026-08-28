import "server-only";

import type {
  CookingEffect,
  CookingEffectTag,
  CookingField,
  CookingMethod,
  CookingRecipePublic,
} from "./types";
import { COOKING_METHOD_UNLOCK_LEVEL } from "./types";
import { COOKING_EXPANSION_ROWS } from "./expansion";
import { effectForCookingExpansion } from "./expansion/effects";

type Tier = CookingRecipePublic["tier"];
type RecipeRow = readonly [
  id: string,
  name: string,
  field: CookingField,
  method: CookingMethod,
  icon: string,
];
type SimpleRecipeRow = readonly [...RecipeRow, tier: 1 | 2];

const LEVEL_BY_TIER = [1, 1, 10, 20, 35, 50] as const;
const PRIMARY_POWER = [0, 6, 10, 16, 24, 32] as const;
const COMBAT_POWER = [0, 50, 100, 160, 220, 300] as const;
const SURVIVAL_POWER = [0, 300, 700, 1_200, 2_000, 3_000] as const;
const PERCENT_POWER = [0, 1, 2, 3, 4, 5] as const;
const REWARD_POWER = [0, 4, 7, 10, 12, 15] as const;

function effectFor(
  field: CookingField,
  tier: Tier,
  index: number,
): { effect: CookingEffect; effectTags: readonly CookingEffectTag[] } {
  const variant = index % 4;
  if (field === "hearth") {
    if (variant === 0) return { effect: { combatFlat: { atk: COMBAT_POWER[tier] } }, effectTags: ["offense"] };
    if (variant === 1) return { effect: { primaryFlat: { str: PRIMARY_POWER[tier] } }, effectTags: ["offense"] };
    if (variant === 2) return { effect: { combatFlat: { accuracy: Math.round(COMBAT_POWER[tier] / 2) }, primaryFlat: { dex: Math.round(PRIMARY_POWER[tier] / 2) } }, effectTags: ["offense"] };
    return { effect: { primaryPct: { str: PERCENT_POWER[tier] } }, effectTags: ["offense"] };
  }
  if (field === "pot") {
    if (variant === 0) return { effect: { combatFlat: { def: COMBAT_POWER[tier] } }, effectTags: ["defense"] };
    if (variant === 1) return { effect: { combatFlat: { maxHp: SURVIVAL_POWER[tier] } }, effectTags: ["defense", "recovery"] };
    if (variant === 2) return { effect: { primaryFlat: { vit: PRIMARY_POWER[tier] } }, effectTags: ["defense"] };
    return { effect: { primaryPct: { vit: PERCENT_POWER[tier] } }, effectTags: ["defense"] };
  }
  if (field === "baking") {
    if (variant === 0) return { effect: { combatFlat: { magicAtk: COMBAT_POWER[tier] } }, effectTags: ["offense"] };
    if (variant === 1) return { effect: { combatFlat: { maxMp: Math.round(SURVIVAL_POWER[tier] / 3) } }, effectTags: ["recovery"] };
    if (variant === 2) return { effect: { primaryFlat: { int: PRIMARY_POWER[tier], luk: Math.round(PRIMARY_POWER[tier] / 2) } }, effectTags: ["offense"] };
    return { effect: { huntGoldPct: REWARD_POWER[tier] }, effectTags: ["hunt_gold"] };
  }
  if (field === "seafood") {
    if (variant === 0) return { effect: { combatFlat: { accuracy: COMBAT_POWER[tier] } }, effectTags: ["offense"] };
    if (variant === 1) return { effect: { primaryFlat: { dex: PRIMARY_POWER[tier] } }, effectTags: ["offense"] };
    if (variant === 2) return { effect: { huntExpPct: REWARD_POWER[tier] }, effectTags: ["hunt_exp"] };
    return { effect: { combatFlat: { atk: Math.round(COMBAT_POWER[tier] / 2), magicAtk: Math.round(COMBAT_POWER[tier] / 2) } }, effectTags: ["offense"] };
  }
  if (variant === 0) return { effect: { primaryFlat: { spi: PRIMARY_POWER[tier] } }, effectTags: ["life"] };
  if (variant === 1) return { effect: { cookingXpPct: REWARD_POWER[tier] }, effectTags: ["life"] };
  if (variant === 2) return { effect: { combatFlat: { magicDef: COMBAT_POWER[tier] } }, effectTags: ["defense"] };
  return { effect: { primaryPct: { spi: PERCENT_POWER[tier] }, huntExpPct: Math.max(1, Math.round(REWARD_POWER[tier] / 2)) }, effectTags: ["life", "hunt_exp"] };
}

function rowToRecipe(
  row: RecipeRow,
  tier: Tier,
  discovery: CookingRecipePublic["discovery"],
  index: number,
): CookingRecipePublic {
  const [id, name, field, method, icon] = row;
  const { effect, effectTags } = effectFor(field, tier, index);
  return {
    id,
    name,
    field,
    method,
    icon,
    tier,
    requiredLevel:
      discovery === "basic"
        ? 1
        : Math.max(
            LEVEL_BY_TIER[tier],
            COOKING_METHOD_UNLOCK_LEVEL[method],
          ) as CookingRecipePublic["requiredLevel"],
    discovery,
    effect,
    effectTags,
    imageSrc: `/images/items/cooking/${id}.webp`,
    description:
      discovery === "basic"
        ? "요리 경험치를 안정적으로 쌓는 기본 조리법입니다."
        : discovery === "signature"
          ? "여러 분야의 기법을 엮은 최고급 비밀 요리입니다."
          : `${name}의 숨은 조합을 직접 연구해 발견합니다.`,
  };
}

const BASIC_ROWS: readonly RecipeRow[] = [
  ["rustic_bread", "투박한 밀빵", "baking", "bake", "🍞"],
  ["herb_tea", "깨달음의 허브차", "medicinal", "brew", "🍵"],
  ["grilled_corn", "구운 옥수수", "hearth", "grill", "🌽"],
  ["fish_skewer", "생선 꼬치구이", "seafood", "grill", "🐟"],
  ["herb_flatbread", "향긋한 허브 납작빵", "baking", "bake", "🫓"],
  ["country_egg_bread", "시골식 달걀빵", "baking", "bake", "🥚"],
];

const SIMPLE_ROWS: readonly SimpleRecipeRow[] = [
  ["fried_egg", "소금 간 계란후라이", "hearth", "fry", "🍳", 1],
  ["boiled_egg", "소금 삶은 달걀", "pot", "boil", "🥚", 1],
  ["grilled_potato", "소금 감자구이", "hearth", "grill", "🥔", 1],
  ["buttered_corn", "버터 옥수수구이", "hearth", "grill", "🌽", 1],
  ["simple_tomato_soup", "소박한 토마토 수프", "pot", "boil", "🥣", 1],
  ["milk_bread", "부드러운 우유빵", "baking", "bake", "🍞", 1],
  ["sugar_cookie", "바삭한 설탕 쿠키", "baking", "bake", "🍪", 1],
  ["strawberry_jam", "달콤한 딸기잼", "baking", "boil", "🍓", 1],
  ["campfire_fish", "모닥불 생선구이", "seafood", "grill", "🐟", 1],
  ["simple_fish_soup", "소박한 생선국", "seafood", "boil", "🍲", 1],
  ["strawberry_milk", "딸기 우유", "medicinal", "brew", "🥛", 1],
  ["hot_cacao", "따뜻한 카카오", "medicinal", "brew", "☕", 1],
  ["tomato_egg_stir_fry", "토마토 달걀볶음", "hearth", "stir_fry", "🍳", 2],
  ["potato_fries", "짭짤한 감자튀김", "hearth", "fry", "🍟", 2],
  ["herb_egg_soup", "허브 달걀국", "pot", "boil", "🍲", 2],
  ["corn_cream_soup", "고소한 옥수수 수프", "pot", "boil", "🥣", 2],
  ["cacao_cookie", "카카오 쿠키", "baking", "bake", "🍪", 2],
  ["fish_fry", "바삭한 생선튀김", "seafood", "fry", "🐟", 2],
  ["steamed_fish", "담백한 생선찜", "seafood", "steam", "🐟", 2],
  ["herb_pickles", "새콤한 허브 절임", "medicinal", "ferment", "🌿", 2],
];

const FIELD_ROWS: Record<CookingField, readonly RecipeRow[]> = {
  hearth: [
    ["tomato_salad", "불향 토마토 샐러드", "hearth", "grill", "🥗"],
    ["herb_omelet", "허브 오믈렛", "hearth", "fry", "🍳"],
    ["egg_fried_rice", "달걀 볶음밥", "hearth", "stir_fry", "🍳"],
    ["herb_roasted_pork", "허브 돼지고기 구이", "hearth", "grill", "🍖"],
    ["crispy_pork_cutlet", "바삭한 돼지고기 커틀릿", "hearth", "fry", "🍖"],
    ["soy_pork_rice_bowl", "간장 돼지고기 덮밥", "hearth", "stir_fry", "🍱"],
    ["soy_braised_eggs", "간장 달걀 조림", "hearth", "stir_fry", "🥚"],
    ["onion_steak", "두툼한 양파 스테이크", "hearth", "grill", "🧅"],
    ["golden_corn_fritters", "황금 옥수수 튀김", "hearth", "fry", "🌽"],
    ["tomato_pork_skewers", "토마토 돼지고기 꼬치", "hearth", "grill", "🍢"],
    ["herb_rice_cakes", "허브 쌀전병", "hearth", "fry", "🥞"],
    ["black_bean_pork_roast", "검은콩 돼지고기 구이", "hearth", "grill", "🍖"],
    ["firecracker_eggs", "불꽃 달걀 볶음", "hearth", "stir_fry", "🔥"],
    ["harvest_stir_fry", "풍작 채소 볶음", "hearth", "stir_fry", "🥘"],
    ["moonlit_cutlet", "달빛 안심 커틀릿", "hearth", "fry", "🌙"],
    ["peppered_pork_plate", "후추 돼지고기 철판구이", "hearth", "grill", "🥩"],
  ],
  pot: [
    ["fresh_fish_soup", "신선한 생선 수프", "pot", "boil", "🍲"],
    ["corn_tomato_potage", "옥수수 토마토 포타주", "pot", "boil", "🥣"],
    ["potato_stew", "감자 양파 스튜", "pot", "boil", "🥘"],
    ["pearl_onion_soup", "진주 양파 수프", "pot", "boil", "🧅"],
    ["milk_potato_soup", "우유 감자 수프", "pot", "boil", "🥣"],
    ["milk_rice_porridge", "우유 쌀죽", "pot", "boil", "🥣"],
    ["corn_milk_chowder", "옥수수 우유 차우더", "pot", "boil", "🥣"],
    ["flame_corn_stew", "불꽃 옥수수 스튜", "pot", "boil", "🔥"],
    ["spicy_pork_stew", "매콤한 돼지고기 스튜", "pot", "boil", "🥘"],
    ["golden_rice_congee", "황금 쌀 영양죽", "pot", "boil", "🍚"],
    ["black_bean_hotpot", "검은콩 전골", "pot", "boil", "🫕"],
    ["tomato_cream_stew", "토마토 크림 스튜", "pot", "boil", "🍅"],
    ["harvest_root_soup", "풍작 뿌리채소 수프", "pot", "boil", "🥕"],
    ["moon_onion_potage", "달빛 양파 포타주", "pot", "boil", "🌙"],
    ["pork_bone_broth", "진한 돼지고기 육수", "pot", "boil", "🍖"],
    ["herbal_steam_pot", "약초 향 찜솥", "pot", "steam", "♨️"],
  ],
  baking: [
    ["fishermans_pie", "어부의 생선 파이", "baking", "bake", "🥧"],
    ["strawberry_tart", "딸기 타르트", "baking", "bake", "🥧"],
    ["egg_salad_sandwich", "달걀 샐러드 샌드위치", "baking", "bake", "🥪"],
    ["ranch_cream_gratin", "목장 크림 그라탱", "baking", "bake", "🫕"],
    ["milk_custard_pudding", "우유 커스터드 푸딩", "baking", "steam", "🍮"],
    ["strawberry_milk_parfait", "딸기 우유 파르페", "baking", "ferment", "🍨"],
    ["royal_pork_pie", "왕실 돼지고기 파이", "baking", "bake", "🥧"],
    ["golden_gratin", "황금 감자 그라탱", "baking", "bake", "🫕"],
    ["royal_cacao_tart", "왕실 카카오 타르트", "baking", "bake", "🍫"],
    ["white_strawberry_dessert", "설향 딸기 디저트", "baking", "bake", "🍓"],
    ["butter_croissant", "목장 버터 크루아상", "baking", "bake", "🥐"],
    ["onion_quiche", "진주 양파 키슈", "baking", "bake", "🥧"],
    ["corn_cheese_bread", "옥수수 치즈빵", "baking", "bake", "🧀"],
    ["cacao_souffle", "카카오 수플레", "baking", "bake", "🍫"],
    ["moonlight_shortcake", "달빛 딸기 쇼트케이크", "baking", "bake", "🍰"],
    ["grand_bakers_loaf", "대제빵사의 축복빵", "baking", "bake", "🍞"],
  ],
  seafood: [
    ["quality_fish_platter", "고급 생선 모둠", "seafood", "steam", "🍣"],
    ["fish_croquettes", "고급 생선 크로켓", "seafood", "fry", "🧆"],
    ["special_seafood_rice", "특급 해산물 덮밥", "seafood", "steam", "🍤"],
    ["soy_glazed_fish_bowl", "간장 생선 덮밥", "seafood", "stir_fry", "🍱"],
    ["aromatic_fish_curry", "향신 생선 카레", "seafood", "boil", "🍛"],
    ["legendary_sea_banquet", "전설의 바다 만찬", "seafood", "steam", "🐉"],
    ["dragonfire_seafood_hotpot", "용화 해산물 전골", "seafood", "boil", "🐲"],
    ["sea_salt_grilled_fish", "바다 소금 생선구이", "seafood", "grill", "🐟"],
    ["pearl_fish_steam", "진주빛 생선찜", "seafood", "steam", "🦪"],
    ["herb_fish_terrine", "허브 생선 테린", "seafood", "steam", "🌿"],
    ["golden_seafood_paella", "황금 해산물 파에야", "seafood", "stir_fry", "🥘"],
    ["black_bean_fish_braise", "검은콩 생선조림", "seafood", "boil", "🐟"],
    ["sunset_fish_chowder", "노을빛 생선 차우더", "seafood", "boil", "🌅"],
    ["storm_seafood_fry", "폭풍 해산물 튀김", "seafood", "fry", "🍤"],
    ["moon_tide_sashimi", "달물결 숙성회", "seafood", "ferment", "🌙"],
    ["abyssal_fisher_stew", "심해 어부의 스튜", "seafood", "boil", "🌊"],
  ],
  medicinal: [
    ["strawberry_herb_punch", "딸기 허브 펀치", "medicinal", "brew", "🍹"],
    ["soybean_rice", "검은콩 약선밥", "medicinal", "steam", "🍚"],
    ["crystal_cacao_drink", "수정 카카오 음료", "medicinal", "brew", "☕"],
    ["ancient_tomato_meal", "고대종 토마토 정식", "medicinal", "ferment", "🍅"],
    ["silverleaf_tonic", "은빛잎 강장차", "medicinal", "brew", "🍵"],
    ["golden_wheat_tea", "황금 밀차", "medicinal", "brew", "🌾"],
    ["sweet_corn_elixir", "달콤 옥수수 영약", "medicinal", "boil", "🌽"],
    ["heirloom_tomato_juice", "고대종 토마토 발효즙", "medicinal", "ferment", "🍅"],
    ["white_strawberry_tea", "설향 딸기차", "medicinal", "brew", "🍓"],
    ["golden_potato_decoction", "황금 감자 달임물", "medicinal", "boil", "🥔"],
    ["pearl_onion_extract", "진주 양파 농축액", "medicinal", "ferment", "🧅"],
    ["golden_rice_ferment", "황금 쌀 발효음료", "medicinal", "ferment", "🍶"],
    ["black_soybean_tonic", "검은콩 자양음료", "medicinal", "brew", "🫘"],
    ["crystal_sugar_syrup", "수정 사탕수수 시럽", "medicinal", "boil", "💎"],
    ["royal_cacao_brew", "왕실 카카오 약차", "medicinal", "brew", "☕"],
    ["restorative_herb_porridge", "회복의 허브죽", "medicinal", "boil", "🥣"],
  ],
};

const SIGNATURE_ROWS: readonly RecipeRow[] = [
  ["ranch_grand_feast", "목장 대만찬", "hearth", "grill", "🍽️"],
  ["earth_grand_feast", "대지의 대만찬", "pot", "boil", "🍽️"],
  ["five_flame_banquet", "오화 화덕 연회", "hearth", "grill", "🔥"],
  ["deep_pot_banquet", "심연의 냄비 연회", "pot", "boil", "🫕"],
  ["royal_pastry_tower", "왕실 제과탑", "baking", "bake", "🧁"],
  ["ocean_emperors_table", "해황제의 식탁", "seafood", "steam", "👑"],
  ["sage_medicinal_table", "현자의 약선상", "medicinal", "brew", "📜"],
  ["harvest_moon_feast", "풍작달 축제상", "pot", "steam", "🌕"],
  ["starlight_breakfast", "별빛 아침 정찬", "baking", "bake", "✨"],
  ["dragon_chef_omakase", "용의 주방장 특선", "seafood", "grill", "🐉"],
  ["golden_field_festival", "황금 들판 축제상", "hearth", "stir_fry", "🌾"],
  ["midnight_cacao_banquet", "한밤의 카카오 연회", "baking", "ferment", "🌌"],
  ["pearl_coast_wedding_feast", "진주 해안 혼례상", "seafood", "steam", "🦪"],
  ["eternal_kitchen_legend", "영원의 주방 전설", "medicinal", "ferment", "🏆"],
];

const basic = BASIC_ROWS.map((row, index) => rowToRecipe(row, 1, "basic", index));
const simple = SIMPLE_ROWS.map((row, index) => {
  const [id, name, field, method, icon, tier] = row;
  return rowToRecipe([id, name, field, method, icon], tier, "hidden", index);
});
const hidden = (Object.keys(FIELD_ROWS) as CookingField[]).flatMap((field) =>
  FIELD_ROWS[field].map((row, index) =>
    rowToRecipe(row, (2 + Math.floor(index / 4)) as Tier, "hidden", index),
  ),
);
const signature = SIGNATURE_ROWS.map((row, index) =>
  rowToRecipe(row, 5, "signature", index),
);
const expansionOccurrences = new Map<string, number>();
const expansion = COOKING_EXPANSION_ROWS.map((row) => {
  const [id, name, field, method, icon, tier] = row;
  const group = `${field}:${tier}`;
  const occurrence = expansionOccurrences.get(group) ?? 0;
  expansionOccurrences.set(group, occurrence + 1);
  const { effect, effectTags } = effectForCookingExpansion(
    field,
    tier,
    occurrence,
  );
  return {
    ...rowToRecipe([id, name, field, method, icon], tier, "hidden", occurrence),
    effect,
    effectTags,
    description:
      tier <= 2
        ? `${name}의 친숙한 조합을 직접 연구해 발견합니다.`
        : `${name}에 담긴 특별한 조리법을 직접 연구해 발견합니다.`,
  };
});
const legacyRecipes = [...basic, ...hidden, ...signature];

export const COOKING_PUBLIC_RECIPES: readonly CookingRecipePublic[] = [
  ...basic,
  ...simple,
  ...hidden,
  ...signature,
  ...expansion,
];

export const BASIC_COOKING_RECIPE_IDS = basic.map((entry) => entry.id);
export const SIMPLE_COOKING_RECIPE_IDS = simple.map((entry) => entry.id);
export const EXPANSION_COOKING_RECIPE_IDS = expansion.map((entry) => entry.id);
export const COOKING_LEGACY_RECIPE_INDEX_BY_ID: ReadonlyMap<string, number> =
  new Map(legacyRecipes.map((entry, index) => [entry.id, index]));
export const COOKING_PUBLIC_RECIPE_BY_ID = new Map(
  COOKING_PUBLIC_RECIPES.map((entry) => [entry.id, entry]),
);
