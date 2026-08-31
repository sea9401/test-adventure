import type { FarmItemId } from "../farm";

// 농장 보유품 전체가 아니라 실제 식재료만 연구 후보로 허용한다.
// 새 농장 아이템은 요리에 쓰는 것이 확인된 뒤 명시적으로 추가한다.
export const COOKING_FARM_INGREDIENT_IDS = [
  "wheat",
  "golden_wheat",
  "herb",
  "silverleaf",
  "corn",
  "sweet_corn",
  "tomato",
  "heirloom_tomato",
  "strawberry",
  "white_strawberry",
  "potato",
  "golden_potato",
  "onion",
  "pearl_onion",
  "rice",
  "golden_rice",
  "soybean",
  "black_soybean",
  "sugarcane",
  "crystal_sugarcane",
  "cacao",
  "royal_cacao",
  "egg",
  "milk",
  "pork",
] as const satisfies readonly FarmItemId[];

export type CookingFarmIngredientId =
  (typeof COOKING_FARM_INGREDIENT_IDS)[number];

const COOKING_FARM_INGREDIENT_ID_SET = new Set<string>(
  COOKING_FARM_INGREDIENT_IDS,
);

export function isCookingFarmIngredientId(
  value: string,
): value is CookingFarmIngredientId {
  return COOKING_FARM_INGREDIENT_ID_SET.has(value);
}
