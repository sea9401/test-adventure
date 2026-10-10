import type { CookingIngredientId, CookingMethod } from "./types";

// 재료 순서와 무관하게 같은 연구 조합을 같은 키로 묶는다. 서버의 실패 조합 판정과 같은 기준이다.
export function cookingResearchAttemptKey(
  method: CookingMethod,
  ingredientIds: readonly CookingIngredientId[],
): string {
  return `${method}:${[...ingredientIds].sort().join("|")}`;
}
