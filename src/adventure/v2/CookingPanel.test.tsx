import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CookingRecipeXpPreview,
  RecipeOwnedCount,
  SurplusCropLabel,
  cookingLevelProgressView,
} from "./CookingPanel";
import {
  COOKING_RECIPE_BY_ID,
  type CookingFoodInventory,
} from "./cooking";

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

describe("주방 요리 경험치 표시", () => {
  it("요리별 제작 경험치는 현재 레벨 감쇠와 직업·스킬 보너스 범위를 안내한다", () => {
    const html = renderToStaticMarkup(
      <CookingRecipeXpPreview
        recipe={COOKING_RECIPE_BY_ID.get("rustic_bread")!}
        currentLevel={11}
        bonusPct={15}
      />,
    );

    expect(html).toContain("제작 XP · 1개당 +3~4");
  });

  it("누적 경험치가 아니라 현재 레벨에서 쌓은 경험치로 표시한다", () => {
    expect(
      cookingLevelProgressView({
        xp: 12_345,
        currentLevelXp: 10_000,
        nextLevelXp: 15_000,
      }),
    ).toEqual({
      percent: 46.9,
      label: "2,345 / 5,000 XP",
    });
  });

  it("최고 레벨은 기존 안내를 유지한다", () => {
    expect(
      cookingLevelProgressView({
        xp: 24_010,
        currentLevelXp: 24_010,
        nextLevelXp: null,
      }),
    ).toEqual({ percent: 100, label: "최고 레벨" });
  });
});
