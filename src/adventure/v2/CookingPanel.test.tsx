import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CookingWorkspace, cookingErrorText, cookingLevelProgressView } from "./CookingPanel";
import { COOKING_PUBLIC_RECIPES } from "./cooking/catalog";
import { COOKING_SECRET_RECIPES } from "@/lib/server/cooking/recipes";
import { cookingRequests } from "./cooking/delivery";
import { cookingFoodId } from "./cooking/food";
import { COOKING_PANTRY_ITEMS, COOKING_PROCESSING_RECIPES } from "./cooking/kitchen";
import { cookingLevelXpThreshold, emptyCookingState } from "./cooking/state";
import { FARM_ITEMS } from "./farm";
import { FISHING_CATCH_ITEMS } from "./fishingStock";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import type { CookingResponse } from "./cooking/clientTypes";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

function fixture(): CookingResponse {
  const cooking = {
    ...emptyCookingState(NOW),
    xp: cookingLevelXpThreshold(20),
  };
  const requests = cookingRequests("cook-user", cooking);
  requests.daily[0] = {
    id: "daily:test:hearth",
    kind: "daily",
    title: "화덕 분야 식단",
    targetScore: 100,
    condition: { field: "hearth", minimumQuality: "normal" },
    rewards: { gold: 35_000, reputation: 4, cookingXp: 80, specialtyXp: 40 },
  };
  const foodId = cookingFoodId({ recipeId: "tomato_salad", quality: "masterpiece", originator: true, specialtyBonusPct: 5 });
  return {
    ok: true,
    now: NOW,
    cooking,
    level: 20,
    currentLevelXp: cookingLevelXpThreshold(20),
    nextLevelXp: cookingLevelXpThreshold(21),
    recipes: [...COOKING_PUBLIC_RECIPES],
    knownRecipes: COOKING_SECRET_RECIPES.filter((entry) => cooking.discoveredRecipeIds.includes(entry.id)),
    firstDiscoveries: [],
    requests,
    cookingFoods: { [foodId]: 2 },
    failedCookingDishes: 1,
    farmItems: { wheat: 10, milk: 10, tomato: 10, pork: 10, onion: 10 },
    farmItemDefinitions: FARM_ITEMS,
    farmReputation: 12,
    fishingItems: { catch_common: 2 },
    fishingItemDefinitions: FISHING_CATCH_ITEMS,
    kitchenItems: { "pantry:salt": 3, "processed:flour": 2 },
    pantryItems: [...COOKING_PANTRY_ITEMS],
    processingRecipes: [...COOKING_PROCESSING_RECIPES],
    cookingJobId: null,
    cookingJobName: null,
    cookingJobTier: 0,
    cookingSkillBonuses: { xpBonusPct: 0, carefulChancePct: 0, materialReductionPct: 0, masterpieceChancePct: 0, rareIngredientSaveChancePct: 0 },
  };
}

function renderSection(section: Parameters<typeof CookingWorkspace>[0]["section"]) {
  return renderToStaticMarkup(<CookingWorkspace data={fixture()} section={section} onSectionChange={vi.fn()} busy={false} mutate={vi.fn(async () => undefined)} />);
}

describe("개편 요리 연구실", () => {
  it("다섯 탭과 12시간 음식 안내를 제공한다", () => {
    const html = renderSection("research");
    for (const label of ["연구", "도감", "전문 분야", "납품", "재료 가공"]) expect(html).toContain(label);
    expect(html).toContain("12시간 음식");
    expect(html).toContain("정답 조합과 힌트는 공개되지 않습니다");
    expect(html).toContain(SURFACE_CARD.split(" ")[0]);
  });

  it.each([
    ["research", "레시피 연구"],
    ["codex", "요리 도감"],
    ["specialty", "한 번 정하면 변경하거나 초기화할 수 없습니다"],
    ["delivery", "조건 납품"],
    ["processing", "주방 상점"],
  ] as const)("%s 화면을 렌더링한다", (section, text) => {
    expect(renderSection(section)).toContain(text);
  });

  it("미발견 도감 카드에 서버 전용 조합을 넣지 않는다", () => {
    const html = renderSection("codex");
    expect(html).toContain("미발견 레시피");
    expect(html).not.toContain("불향 토마토 샐러드");
    expect(html).not.toContain("T2 · Lv 10");
  });

  it("납품 전에 품질·원조·전문 표식이 반영된 점수를 보여준다", () => {
    const html = renderSection("delivery");
    expect(html).toContain("개당 42점");
    expect(html).toContain("이번 42점");
  });

  it("중복 오답은 재료 비소모 안내로 번역한다", () => {
    expect(cookingErrorText("duplicate_combination")).toContain("재료는 소비하지 않았습니다");
  });

  it("현재 레벨 구간 경험치를 계산한다", () => {
    expect(cookingLevelProgressView({ xp: 12_345, currentLevelXp: 10_000, nextLevelXp: 15_000 })).toEqual({ percent: 46.9, label: "2,345 / 5,000 XP" });
  });
});
