// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FARM_ITEMS } from "../farm";
import { FISHING_CATCH_ITEMS } from "../fishingStock";
import { COOKING_SECRET_RECIPES } from "@/lib/server/cooking/recipes";
import { COOKING_PUBLIC_RECIPES } from "./catalog";
import { CookingCodexPanel } from "./CookingCodexPanel";
import { cookingRequests } from "./delivery";
import { COOKING_PANTRY_ITEMS, COOKING_PROCESSING_RECIPES } from "./kitchen";
import { cookingLevelXpThreshold, emptyCookingState } from "./state";
import type { CookingResponse } from "./clientTypes";

afterEach(cleanup);

function codexFixture(recipeCount: number): CookingResponse {
  const now = Date.parse("2026-08-23T12:00:00+09:00");
  const cooking = emptyCookingState(now);
  return {
    ok: true,
    now,
    cooking,
    level: 1,
    currentLevelXp: cookingLevelXpThreshold(1),
    nextLevelXp: cookingLevelXpThreshold(2),
    recipeTotal: recipeCount,
    knownRecipes: COOKING_SECRET_RECIPES.filter((recipe) =>
      cooking.discoveredRecipeIds.includes(recipe.id),
    ).slice(0, recipeCount),
    publicDiscoveries: [],
    failedResearches: [],
    requests: cookingRequests("cook-user", cooking),
    cookingFoods: {},
    cookingFoodDefinitions: {},
    failedCookingDishes: 0,
    cookingPrepSets: 0,
    farmItems: {},
    farmItemDefinitions: FARM_ITEMS,
    farmReputation: 0,
    fishingItems: {},
    fishingItemDefinitions: FISHING_CATCH_ITEMS,
    kitchenItems: {},
    pantryItems: [...COOKING_PANTRY_ITEMS],
    processingRecipes: [...COOKING_PROCESSING_RECIPES],
    cookingJobId: null,
    cookingJobName: null,
    cookingJobTier: 0,
    cookingSkillBonuses: {
      xpBonusPct: 0,
      carefulChancePct: 0,
      materialReductionPct: 0,
      masterpieceChancePct: 0,
      rareIngredientSaveChancePct: 0,
    },
  };
}

describe("요리 도감 페이지네이션", () => {
  it("기본 목록에서 발견한 레시피를 미발견 레시피보다 먼저 보여준다", () => {
    const data = codexFixture(7);

    render(
      <CookingCodexPanel
        data={data}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    const cards = screen.getAllByRole("article");
    expect(cards[0].textContent).toContain("투박한 밀빵");
    expect(cards.at(-1)?.textContent).toContain("미발견 레시피");
  });

  it("발견한 요리를 이름과 재료로 검색하고 결과 수를 표시한다", () => {
    const { container } = render(
      <CookingCodexPanel
        data={codexFixture(13)}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    const search = screen.getByRole("searchbox", { name: "요리 도감 검색" });
    fireEvent.change(search, { target: { value: "효모" } });

    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(screen.getByText("투박한 밀빵")).toBeTruthy();
    expect(screen.getByText("검색 결과 1개")).toBeTruthy();
  });

  it("미발견 레시피의 숨겨진 이름은 검색으로 노출하지 않는다", () => {
    const data = codexFixture(7);
    const hiddenName = COOKING_PUBLIC_RECIPES[6].name;
    const { container } = render(
      <CookingCodexPanel
        data={data}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "요리 도감 검색" }),
      { target: { value: hiddenName } },
    );

    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(screen.getByText("검색 조건에 맞는 레시피가 없습니다.")).toBeTruthy();
  });

  it("발견한 레시피를 이름순으로 정렬한다", () => {
    const data = codexFixture(3);
    data.knownRecipes = [data.knownRecipes[0], data.knownRecipes[2], data.knownRecipes[1]];
    render(
      <CookingCodexPanel
        data={data}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "요리 도감 정렬" }),
      { target: { value: "name" } },
    );

    expect(screen.getAllByRole("article")[0].textContent).toContain("구운 옥수수");
  });

  it("전체 레시피 수를 실제 공개 도감 기준으로 표시한다", () => {
    render(
      <CookingCodexPanel
        data={codexFixture(120)}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText(/개인 발견 6\/120/)).toBeTruthy();
  });

  it("발견한 레시피에 기본 조리 경험치를 표시한다", () => {
    render(
      <CookingCodexPanel
        data={codexFixture(1)}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("기본 조리 XP +20")).toBeTruthy();
  });

  it("요리 준비 세트는 기본적으로 끄고 선택했을 때만 조리 요청에 포함한다", () => {
    const data = codexFixture(1);
    data.cookingPrepSets = 2;
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingCodexPanel data={data} busy={false} mutate={mutate} />,
    );

    const prepSet = screen.getByRole("checkbox", { name: /요리 준비 세트 사용/ });
    expect((prepSet as HTMLInputElement).checked).toBe(false);
    fireEvent.click(prepSet);
    fireEvent.click(screen.getByRole("button", { name: "1개 조리" }));

    expect(mutate).toHaveBeenCalledWith({
      action: "craft",
      recipeId: data.knownRecipes[0].id,
      quantity: 1,
      usePrepSet: true,
    });
  });

  it("레시피를 12개씩 보여주고 다음 페이지로 이동한다", () => {
    const { container } = render(
      <CookingCodexPanel
        data={codexFixture(13)}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(container.querySelectorAll("article")).toHaveLength(12);
    expect(screen.getByRole("navigation", { name: "페이지 네비게이션" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));

    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "2 페이지" }).getAttribute("aria-current")).toBe("page");
  });
});
