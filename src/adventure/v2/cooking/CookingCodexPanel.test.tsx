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
    recipes: COOKING_PUBLIC_RECIPES.slice(0, recipeCount),
    knownRecipes: COOKING_SECRET_RECIPES.filter((recipe) =>
      cooking.discoveredRecipeIds.includes(recipe.id),
    ),
    firstDiscoveries: [],
    failedResearches: [],
    requests: cookingRequests("cook-user", cooking),
    cookingFoods: {},
    failedCookingDishes: 0,
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
