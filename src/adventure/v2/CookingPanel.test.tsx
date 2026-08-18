import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CookingPanel,
  CookingRecipeXpPreview,
  RecipeOwnedCount,
  StandingCookingDeliveryBoard,
  SurplusCropLabel,
  cookingLevelProgressView,
} from "./CookingPanel";
import {
  COOKING_RECIPE_BY_ID,
  cookingFoodId,
  type CookingFoodInventory,
  type CookingRecipe,
} from "./cooking";
import { SURFACE_INSET } from "@/components/ui/surfaces";

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<(...args: never[]) => unknown>,
  refreshGameState: vi.fn(async () => {}),
  setNotice: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => {
      mocks.callbacks.push(callback);
      return callback;
    },
  };
});

vi.mock("./GameStateRefreshContext", () => ({
  useRefreshGameState: () => mocks.refreshGameState,
}));

vi.mock("./RewardToastProvider", () => ({
  useSystemMessageState: () => [null, mocks.setNotice],
}));

describe("요리 납품 공용 골드 동기화", () => {
  beforeEach(() => {
    mocks.callbacks = [];
    mocks.refreshGameState.mockClear();
    mocks.setNotice.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          result: {
            action: "order",
            recipeName: "소박한 빵",
            quantity: 1,
            quality: "normal",
            earnedXp: 1,
            savedRareIngredients: 0,
            orderRewardGold: 100,
            standingDeliveryRewardGold: 0,
            orderRewardReputation: 1,
            orderQualityBonusPct: 0,
          },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["order", "standing_delivery"] as const)(
    "%s 성공 직후 은행 화면이 읽는 공용 게임 상태를 갱신한다",
    async (action) => {
      renderToStaticMarkup(<CookingPanel />);
      const cook = mocks.callbacks[1] as unknown as (
        recipe: CookingRecipe,
        action: "order" | "standing_delivery",
        quantity?: number,
        foodId?: string,
      ) => Promise<void>;

      expect(cook).toBeTypeOf("function");
      await cook(COOKING_RECIPE_BY_ID.get("rustic_bread")!, action, 1);

      expect(mocks.refreshGameState).toHaveBeenCalledOnce();
    },
  );
});

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

describe("상시 요리 납품", () => {
  it("보유 음식의 품질 태그와 개당·총 보상을 기본 수량 1개로 표시한다", () => {
    const foodId = cookingFoodId({
      recipeId: "spicy_pork_stew",
      quality: "masterpiece",
      usedRare: true,
      extended: true,
    });
    const html = renderToStaticMarkup(
      <StandingCookingDeliveryBoard
        cookingFoods={{ [foodId]: 3 }}
        completed={4}
        busy={null}
        onDeliver={() => undefined}
      />,
    );

    expect(html).toContain("상시 납품 4/20");
    expect(html).toContain("희귀 특선");
    expect(html).toContain("장시간");
    expect(html).toContain("보유 3개");
    expect(html).toContain("개당 75,000 골드");
    expect(html).toContain('value="1"');
    expect(html).toContain("총 75,000 골드");
    expect(html).toContain(SURFACE_INSET.split(" ")[0]);
  });

  it("완성 요리가 없으면 빈 상태를 안내한다", () => {
    const html = renderToStaticMarkup(
      <StandingCookingDeliveryBoard
        cookingFoods={{}}
        completed={0}
        busy={null}
        onDeliver={() => undefined}
      />,
    );

    expect(html).toContain("납품할 완성 요리가 없습니다.");
  });

  it("하루 20개를 채우면 추가 납품을 비활성화한다", () => {
    const foodId = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "normal",
      usedRare: false,
      extended: false,
    });
    const html = renderToStaticMarkup(
      <StandingCookingDeliveryBoard
        cookingFoods={{ [foodId]: 2 }}
        completed={20}
        busy={null}
        onDeliver={() => undefined}
      />,
    );

    expect(html).toContain("상시 납품 20/20");
    expect(html).toContain("오늘 납품 완료");
    expect(html).toContain("disabled");
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

  it("최고 레벨은 최종 숙련 달성 상태를 안내한다", () => {
    expect(
      cookingLevelProgressView({
        xp: 24_010,
        currentLevelXp: 24_010,
        nextLevelXp: null,
      }),
    ).toEqual({ percent: 100, label: "최종 숙련 달성 · MAX" });
  });
});
