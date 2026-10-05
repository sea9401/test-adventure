import { describe, expect, it } from "vitest";
import { COOKING_SECRET_RECIPES } from "@/lib/server/cooking/recipes";
import { cookingRecipeMatchesSearch, cookingSearchTerms } from "./codexSearch";

function recipe(id: string) {
  const found = COOKING_SECRET_RECIPES.find((entry) => entry.id === id);
  if (!found) throw new Error(id);
  return found;
}

const BREAD = { recipe: recipe("rustic_bread"), ingredientNames: ["밀", "효모"] };
const EGG = { recipe: recipe("fried_egg"), ingredientNames: ["달걀", "소금"] };
const SKEWER = { recipe: recipe("fish_skewer"), ingredientNames: ["흔한 물고기", "허브"] };
const BUTTER_TOAST = { recipe: recipe("butter_toast"), ingredientNames: ["밀가루", "버터"] };

function matches(entry: typeof BREAD, query: string): boolean {
  return cookingRecipeMatchesSearch(entry.recipe, entry.ingredientNames, cookingSearchTerms(query));
}

describe("요리 도감 검색", () => {
  it("쉼표로 나눈 검색어를 모두 만족해야 일치한다", () => {
    expect(cookingSearchTerms(" 공격력 , 밀,, ")).toEqual(["공격력", "밀"]);
    expect(matches(BUTTER_TOAST, "공격력, 밀")).toBe(true);
    expect(matches(EGG, "공격력, 밀")).toBe(false);
    expect(matches(EGG, "화덕, 튀기기")).toBe(true);
    expect(matches(BREAD, "화덕, 튀기기")).toBe(false);
  });

  it("공격력·방어력 검색은 마법 계열 효과만 있는 요리를 제외한다", () => {
    expect(matches(EGG, "공격력")).toBe(true);
    expect(matches(BREAD, "공격력")).toBe(false);
    expect(matches(SKEWER, "공격력")).toBe(true);
    expect(matches(BREAD, "마법공격력")).toBe(true);
    expect(matches({ recipe: recipe("strawberry_milk"), ingredientNames: [] }, "방어력")).toBe(false);
    expect(matches({ recipe: recipe("simple_tomato_soup"), ingredientNames: [] }, "방어력")).toBe(true);
  });

  it("빈 검색어는 모두 일치한다", () => {
    expect(matches(BREAD, " , ")).toBe(true);
  });
});
