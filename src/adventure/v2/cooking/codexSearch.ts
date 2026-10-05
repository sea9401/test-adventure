import { COOKING_COMBAT_FLAT_LABELS, cookingEffectText } from "./foodShared";
import {
  COOKING_EFFECT_TAG_NAMES,
  COOKING_FIELD_NAMES,
  COOKING_METHOD_NAMES,
  type CookingCombatFlatKey,
  type CookingRecipePublic,
} from "./types";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

// '공격력'이 '마법공격력'에 부분 일치하지 않도록 전투 효과 이름은 정확히 비교한다.
const EXACT_EFFECT_KEYS = new Map(
  Object.entries(COOKING_COMBAT_FLAT_LABELS).map(([key, label]) => [
    normalize(label),
    key as CookingCombatFlatKey,
  ]),
);

/** 쉼표로 나눈 검색 조건. 모든 조건을 만족하는 레시피만 남긴다. */
export function cookingSearchTerms(query: string): string[] {
  return query.split(/[,，]/).map(normalize).filter(Boolean);
}

export function cookingRecipeMatchesSearch(
  recipe: CookingRecipePublic,
  ingredientNames: readonly string[],
  terms: readonly string[],
): boolean {
  if (terms.length === 0) return true;
  const searchText = normalize([
    recipe.name,
    COOKING_FIELD_NAMES[recipe.field],
    COOKING_METHOD_NAMES[recipe.method],
    `T${recipe.tier}`,
    `Lv ${recipe.requiredLevel}`,
    ...recipe.effectTags.map((effectTag) => `${COOKING_EFFECT_TAG_NAMES[effectTag]} 효과`),
    cookingEffectText(recipe.effect),
    ...ingredientNames,
  ].join(" "));
  return terms.every((term) => {
    const effectKey = EXACT_EFFECT_KEYS.get(term);
    if (effectKey) return Boolean(recipe.effect.combatFlat?.[effectKey]);
    return searchText.includes(term);
  });
}
