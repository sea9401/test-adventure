import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecipeOwnedCount, SurplusCropLabel } from "./CookingPanel";
import type { CookingFoodInventory } from "./cooking";

describe("요리책 보유 수량", () => {
  it("같은 요리의 모든 품질을 합산하고 다른 요리는 제외한다", () => {
    const cookingFoods = {
      "food:herb_tea:normal:base:standard": 2,
      "food:herb_tea:careful:base:standard": 5,
      "food:rustic_bread:masterpiece:base:standard": 11,
    } as CookingFoodInventory;

    const html = renderToStaticMarkup(
      <RecipeOwnedCount recipeId="herb_tea" cookingFoods={cookingFoods} />,
    );

    expect(html).toContain("보유 <strong>7</strong>개");
    expect(html).not.toContain("18");
  });

  it("보유하지 않은 요리도 0개로 표시한다", () => {
    const html = renderToStaticMarkup(
      <RecipeOwnedCount recipeId="herb_tea" cookingFoods={{}} />,
    );

    expect(html).toContain("보유 <strong>0</strong>개");
  });
});

describe("농장 떨이 교환", () => {
  it("콩을 기기 의존 이모지 대신 농장 아이템 이미지로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SurplusCropLabel itemId="soybean" itemName="콩" owned={23} />,
    );

    expect(html).toContain("/images/items/farm/soybean.webp");
    expect(html).toContain('aria-label="콩"');
    expect(html).toContain("<strong>23</strong>개");
    expect(html).not.toContain("🫘");
  });
});
