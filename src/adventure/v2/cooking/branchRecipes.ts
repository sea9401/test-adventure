// 요리 특화 전용 요리 42종 — 특화마다 랭크 1·3·5 에서 하나씩 열린다.
// 연구 대상이 아니라 조합법이 공개돼 있어 화면도 이 파일을 직접 읽는다(서버 전용 카탈로그에 의존하지 않는다).
// 설계: docs/superpowers/specs/2026-11-13-cooking-branch-design.md

import {
  COOKING_BRANCH_BY_ID,
  COOKING_BRANCHES,
  type CookingBranchId,
} from "./branch";
import type {
  CookingEffect,
  CookingEffectTag,
  CookingIngredientId,
  CookingMethod,
  CookingRecipeSecret,
} from "./types";

export type CookingBranchDishRank = 1 | 3 | 5;

export type CookingBranchRecipe = CookingRecipeSecret & {
  branchId: CookingBranchId;
  requiredRank: CookingBranchDishRank;
};

/** 전용 요리를 만들 수 있는 요리 레벨(전문 분야를 고를 수 있는 레벨). */
const BRANCH_DISH_REQUIRED_LEVEL = 20;

// 랭크 1·3·5 요리의 수치. 주 효과는 3·4·5티어, 보조 효과는 1·2·3티어의 기존 요리 수치다.
const COMBAT = [160, 220, 300] as const;
const COMBAT_HALF = [80, 110, 150] as const;
const COMBAT_SUB = [50, 100, 160] as const;
const ACCURACY_SUB = [25, 50, 80] as const;
const HP = [1_200, 2_000, 3_000] as const;
const HP_SUB = [300, 700, 1_200] as const;
const MP = [400, 670, 1_000] as const;
const STAT = [16, 24, 32] as const;
const STAT_SUB = [6, 10, 16] as const;
const REWARD = [10, 12, 15] as const;

type Step = 0 | 1 | 2;

const BRANCH_EFFECTS: Record<
  CookingBranchId,
  { tags: readonly CookingEffectTag[]; effect: (step: Step) => CookingEffect }
> = {
  hearth_grill: {
    tags: ["offense"],
    effect: (step) => ({ combatFlat: { atk: COMBAT[step], accuracy: ACCURACY_SUB[step] } }),
  },
  hearth_fry: {
    tags: ["offense"],
    effect: (step) => ({ combatFlat: { accuracy: COMBAT[step] }, primaryFlat: { dex: STAT_SUB[step] } }),
  },
  hearth_stir: {
    tags: ["offense"],
    effect: (step) => ({ primaryFlat: { str: STAT[step], dex: STAT_SUB[step] } }),
  },
  pot_soup: {
    tags: ["defense", "recovery"],
    effect: (step) => ({ combatFlat: { maxHp: HP[step], def: COMBAT_SUB[step] } }),
  },
  pot_steam: {
    tags: ["defense"],
    effect: (step) => ({ combatFlat: { def: COMBAT[step], magicDef: COMBAT_SUB[step] } }),
  },
  baking_pastry: {
    tags: ["offense"],
    effect: (step) => ({ combatFlat: { magicAtk: COMBAT[step], accuracy: ACCURACY_SUB[step] } }),
  },
  baking_bread: {
    tags: ["recovery"],
    effect: (step) => ({ combatFlat: { maxMp: MP[step] }, primaryFlat: { int: STAT_SUB[step] } }),
  },
  baking_steamed: {
    tags: ["hunt_gold"],
    effect: (step) => ({ huntGoldPct: REWARD[step], primaryFlat: { luk: STAT_SUB[step] } }),
  },
  seafood_fire: {
    tags: ["offense"],
    effect: (step) => ({
      combatFlat: { atk: COMBAT_HALF[step], magicAtk: COMBAT_HALF[step] },
      primaryFlat: { dex: STAT_SUB[step] },
    }),
  },
  seafood_stew: {
    tags: ["hunt_exp", "recovery"],
    effect: (step) => ({ huntExpPct: REWARD[step], combatFlat: { maxHp: HP_SUB[step] } }),
  },
  seafood_pickle: {
    tags: ["offense"],
    effect: (step) => ({ combatFlat: { accuracy: COMBAT[step], magicAtk: COMBAT_SUB[step] } }),
  },
  medicinal_tea: {
    tags: ["life", "defense"],
    effect: (step) => ({ primaryFlat: { spi: STAT[step] }, combatFlat: { magicDef: COMBAT_SUB[step] } }),
  },
  medicinal_ferment: {
    tags: ["defense"],
    effect: (step) => ({ combatFlat: { magicDef: COMBAT[step], maxHp: HP_SUB[step] } }),
  },
  medicinal_meal: {
    tags: ["offense", "life"],
    effect: (step) => ({ primaryFlat: { int: STAT[step], spi: STAT_SUB[step] } }),
  },
};

const RARE_FARM_INGREDIENTS = new Set<CookingIngredientId>([
  "farm:golden_wheat",
  "farm:silverleaf",
  "farm:sweet_corn",
  "farm:heirloom_tomato",
  "farm:white_strawberry",
  "farm:golden_potato",
  "farm:pearl_onion",
  "farm:golden_rice",
  "farm:black_soybean",
  "farm:crystal_sugarcane",
  "farm:royal_cacao",
]);

// 재료 수량 — 같은 티어 기존 요리의 3배. 희귀 작물은 랭크 5 요리에만 2개.
const FARM_COUNT = [12, 15, 18] as const;
const KITCHEN_COUNT = [3, 6, 6] as const;
const FISHING_COUNT = [3, 3, 6] as const;
const RARE_COUNT = 2;

function ingredientCount(id: CookingIngredientId, step: Step): number {
  if (RARE_FARM_INGREDIENTS.has(id)) return RARE_COUNT;
  if (id.startsWith("farm:")) return FARM_COUNT[step];
  if (id.startsWith("fishing:")) return FISHING_COUNT[step];
  return KITCHEN_COUNT[step];
}

type DishRow = readonly [
  name: string,
  method: CookingMethod,
  icon: string,
  ingredientIds: readonly CookingIngredientId[],
];

// 특화마다 [랭크 1, 랭크 3, 랭크 5].
const DISH_ROWS: Record<CookingBranchId, readonly [DishRow, DishRow, DishRow]> = {
  hearth_grill: [
    ["장작 돼지 통구이", "grill", "🍖", ["farm:pork", "farm:onion", "farm:herb", "pantry:salt"]],
    ["허브 숯불 갈비", "grill", "🍖", ["farm:pork", "farm:herb", "farm:onion", "processed:sauce", "pantry:pepper"]],
    ["화덕장의 통구이 만찬", "grill", "🍖", ["farm:pork", "farm:corn", "farm:potato", "processed:sauce", "farm:golden_potato"]],
  ],
  hearth_fry: [
    ["바삭 감자 튀김 모둠", "fry", "🍟", ["farm:potato", "farm:onion", "pantry:oil", "processed:flour"]],
    ["황금빛 달걀 크로켓", "fry", "🍘", ["farm:egg", "farm:potato", "farm:corn", "processed:flour", "pantry:oil"]],
    ["튀김 장인의 한 상", "fry", "🍤", ["farm:pork", "farm:egg", "farm:onion", "pantry:oil", "farm:pearl_onion"]],
  ],
  hearth_stir: [
    ["센 불 채소 볶음", "stir_fry", "🥘", ["farm:onion", "farm:tomato", "farm:soybean", "pantry:oil"]],
    ["철판 돼지 콩 볶음", "stir_fry", "🥘", ["farm:pork", "farm:soybean", "farm:onion", "processed:sauce", "pantry:pepper"]],
    ["불맛 가득 볶음 대접시", "stir_fry", "🍛", ["farm:pork", "farm:rice", "farm:egg", "processed:sauce", "farm:black_soybean"]],
  ],
  pot_soup: [
    ["든든한 감자 고깃국", "boil", "🍲", ["farm:potato", "farm:pork", "farm:onion", "pantry:salt"]],
    ["진한 사골 스튜", "boil", "🍲", ["farm:pork", "farm:potato", "farm:tomato", "processed:broth", "pantry:spice"]],
    ["솥장의 보양 전골", "boil", "🍲", ["farm:pork", "farm:onion", "farm:rice", "processed:broth", "farm:golden_rice"]],
  ],
  pot_steam: [
    ["옥수수 달걀찜", "steam", "🥚", ["farm:corn", "farm:egg", "farm:milk", "pantry:salt"]],
    ["두툼한 돼지 수육찜", "steam", "🥩", ["farm:pork", "farm:onion", "farm:soybean", "processed:broth", "pantry:spice"]],
    ["찜솥 가득 영양 한 상", "steam", "🍱", ["farm:pork", "farm:potato", "farm:corn", "processed:cream", "farm:sweet_corn"]],
  ],
  baking_pastry: [
    ["버터 듬뿍 쿠키 상자", "bake", "🍪", ["farm:wheat", "farm:sugarcane", "farm:egg", "processed:butter"]],
    ["딸기 크림 타르트", "bake", "🥧", ["farm:wheat", "farm:strawberry", "farm:egg", "processed:cream", "processed:butter"]],
    ["제과장의 카카오 케이크", "bake", "🎂", ["farm:wheat", "farm:cacao", "farm:milk", "processed:cream", "farm:royal_cacao"]],
  ],
  baking_bread: [
    ["천천히 부풀린 시골 빵", "ferment", "🍞", ["farm:wheat", "farm:milk", "farm:egg", "pantry:yeast"]],
    ["치즈 품은 발효 식빵", "ferment", "🍞", ["farm:wheat", "farm:milk", "farm:potato", "processed:cheese", "pantry:yeast"]],
    ["제빵장의 황금 밀 브리오슈", "ferment", "🥐", ["farm:wheat", "farm:egg", "farm:milk", "processed:butter", "farm:golden_wheat"]],
  ],
  baking_steamed: [
    ["말랑 우유 푸딩", "steam", "🍮", ["farm:milk", "farm:egg", "farm:sugarcane", "processed:cream"]],
    ["딸기 꿀 증편", "steam", "🍡", ["farm:rice", "farm:strawberry", "farm:sugarcane", "processed:flour", "pantry:yeast"]],
    ["찜과자 장인의 수정 푸딩", "steam", "🍮", ["farm:milk", "farm:egg", "farm:cacao", "processed:cream", "farm:crystal_sugarcane"]],
  ],
  seafood_fire: [
    ["소금 생선 석쇠구이", "grill", "🐟", ["fishing:catch_common", "farm:herb", "farm:onion", "pantry:salt"]],
    ["매콤 해물 철판 볶음", "stir_fry", "🦐", ["fishing:catch_fresh", "farm:onion", "farm:tomato", "processed:sauce", "pantry:oil"]],
    ["선장의 숯불 해물 모둠", "grill", "🦞", ["fishing:catch_quality", "farm:corn", "farm:potato", "pantry:oil", "farm:heirloom_tomato"]],
  ],
  seafood_stew: [
    ["뱃사람의 맑은 생선탕", "boil", "🍲", ["fishing:catch_common", "farm:onion", "farm:rice", "pantry:salt"]],
    ["얼큰 해물 전골", "boil", "🍲", ["fishing:catch_fresh", "farm:soybean", "farm:onion", "processed:broth", "pantry:spice"]],
    ["항구 잔칫날 해물찜", "steam", "🦀", ["fishing:catch_quality", "farm:rice", "farm:soybean", "processed:broth", "farm:silverleaf"]],
  ],
  seafood_pickle: [
    ["식초 생선 절임", "ferment", "🐟", ["fishing:catch_common", "farm:onion", "farm:herb", "pantry:vinegar"]],
    ["숙성 해물 젓갈", "ferment", "🦑", ["fishing:catch_fresh", "farm:soybean", "farm:rice", "pantry:salt", "pantry:vinegar"]],
    ["삼 년 묵힌 어장", "ferment", "🏺", ["fishing:catch_quality", "farm:soybean", "farm:herb", "pantry:vinegar", "farm:black_soybean"]],
  ],
  medicinal_tea: [
    ["향긋한 허브 꿀차", "brew", "🍵", ["farm:herb", "farm:sugarcane", "farm:strawberry", "pantry:spice"]],
    ["은은한 카카오 약차", "brew", "☕", ["farm:herb", "farm:cacao", "farm:sugarcane", "processed:cream", "pantry:spice"]],
    ["다인의 은빛잎 명차", "brew", "🍵", ["farm:herb", "farm:strawberry", "farm:sugarcane", "pantry:spice", "farm:silverleaf"]],
  ],
  medicinal_ferment: [
    ["새콤 딸기 발효청", "ferment", "🍓", ["farm:strawberry", "farm:sugarcane", "farm:herb", "pantry:vinegar"]],
    ["검붉은 콩 발효액", "ferment", "🫘", ["farm:soybean", "farm:tomato", "farm:herb", "pantry:vinegar", "pantry:spice"]],
    ["약선가의 백 일 숙성청", "ferment", "🏺", ["farm:cacao", "farm:soybean", "farm:herb", "pantry:vinegar", "farm:white_strawberry"]],
  ],
  medicinal_meal: [
    ["기운 차리는 약초죽", "boil", "🥣", ["farm:rice", "farm:herb", "farm:soybean", "pantry:salt"]],
    ["맑은 정신 약선찜", "steam", "🍚", ["farm:rice", "farm:herb", "farm:tomato", "processed:broth", "pantry:spice"]],
    ["약선가의 황금 쌀 보양식", "boil", "🥣", ["farm:rice", "farm:herb", "farm:soybean", "processed:broth", "farm:golden_rice"]],
  ],
};

const DISH_RANKS = [1, 3, 5] as const;
const DISH_TIERS = [3, 4, 5] as const;

export const COOKING_BRANCH_RECIPES: readonly CookingBranchRecipe[] =
  COOKING_BRANCHES.flatMap((branch) =>
    DISH_ROWS[branch.id].map((row, index): CookingBranchRecipe => {
      const step = index as Step;
      const [name, method, icon, ingredientIds] = row;
      const id = `branch_${branch.id}_${index + 1}`;
      const tier = DISH_TIERS[step];
      const { tags, effect } = BRANCH_EFFECTS[branch.id];
      return {
        id,
        name,
        icon,
        imageSrc: `/images/items/cooking/${id}.webp`,
        field: branch.field,
        method,
        tier,
        requiredLevel: BRANCH_DISH_REQUIRED_LEVEL,
        discovery: "branch",
        effect: effect(step),
        effectTags: tags,
        description: `${branch.name} 특화 요리사만 만들 수 있는 전용 요리입니다.`,
        ingredients: ingredientIds.map((ingredientId) => ({
          id: ingredientId,
          count: ingredientCount(ingredientId, step),
        })),
        researchXp: 0,
        craftXp: tier * 20,
        branchId: branch.id,
        requiredRank: DISH_RANKS[step],
      };
    }),
  );

export const COOKING_BRANCH_RECIPE_BY_ID: ReadonlyMap<string, CookingBranchRecipe> =
  new Map(COOKING_BRANCH_RECIPES.map((recipe) => [recipe.id, recipe]));

/** 특화의 전용 요리를 요구 랭크 오름차순으로 돌려준다. */
export function cookingBranchRecipesFor(branchId: CookingBranchId): CookingBranchRecipe[] {
  if (!COOKING_BRANCH_BY_ID.has(branchId)) return [];
  return COOKING_BRANCH_RECIPES.filter((recipe) => recipe.branchId === branchId);
}
