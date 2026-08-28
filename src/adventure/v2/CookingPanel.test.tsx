// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookingPanel, CookingWorkspace, cookingErrorText, cookingLevelProgressView } from "./CookingPanel";
import { GameStateRefreshProvider } from "./GameStateRefreshContext";
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
import type { CookingEffectTag } from "./cooking/types";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fixture(effectTag: CookingEffectTag = "offense"): CookingResponse {
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
  requests.daily[2] = {
    id: `daily:test:effect:${effectTag}`,
    kind: "daily",
    title: "정성 효과식",
    targetScore: 100,
    condition: { effectTag, minimumQuality: "careful" },
    rewards: { gold: 60_000, reputation: 6, cookingXp: 120, specialtyXp: 60 },
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
    failedResearches: [],
    requests,
    cookingFoods: { [foodId]: 2 },
    failedCookingDishes: 1,
    cookingPrepSets: 0,
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
  it("상단 안내와 발견 진행도를 현재 레시피 총수로 표시한다", () => {
    const data = fixture();
    data.cooking.discoveredRecipeIds = data.recipes.slice(0, 104).map((recipe) => recipe.id);
    const html = renderToStaticMarkup(
      <CookingWorkspace
        data={data}
        section="research"
        onSectionChange={vi.fn()}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(html).toContain("500종의 레시피 조합");
    expect(html).toContain("발견 104/500");
    expect(html).not.toContain("발견 104/100");
  });

  it("여섯 탭과 12시간 음식 안내를 제공한다", () => {
    const html = renderSection("research");
    for (const label of ["연구", "도감", "공개 발견", "전문 분야", "납품", "재료 가공"]) expect(html).toContain(label);
    expect(html).toContain("12시간 음식");
    expect(html).toContain("정답 조합과 힌트는 공개되지 않습니다");
    expect(html).toContain(SURFACE_CARD.split(" ")[0]);
  });

  it.each([
    ["research", "레시피 연구"],
    ["codex", "요리 도감"],
    ["public", "공개 발견 요리"],
    ["specialty", "한 번 정하면 변경하거나 초기화할 수 없습니다"],
    ["delivery", "조건 납품"],
    ["processing", "주방 상점"],
  ] as const)("%s 화면을 렌더링한다", (section, text) => {
    expect(renderSection(section)).toContain(text);
  });

  it("공개 발견 화면은 요리 이름과 최초 발견자만 공개한다", () => {
    const data = fixture();
    const recipe = data.recipes[10];
    data.firstDiscoveries = [{
      recipeId: recipe.id,
      actorName: "류하린",
      discoveredAt: NOW,
      mine: false,
    }];
    const html = renderToStaticMarkup(
      <CookingWorkspace
        data={data}
        section="public"
        onSectionChange={vi.fn()}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(html).toContain(recipe.name);
    expect(html).toContain("최초 발견자: 류하린");
    expect(html).not.toContain("비밀 재료");
    expect(html).not.toContain("T1");
    expect(html).not.toContain("Lv 1");
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

  it.each([
    ["offense", "공격 효과"],
    ["defense", "방어 효과"],
    ["recovery", "회복 효과"],
    ["hunt_exp", "사냥 경험치 효과"],
    ["hunt_gold", "사냥 골드 효과"],
    ["life", "생활 효과"],
  ] as const)("정성 효과식 제목에 %s 조건을 표시한다", (effectTag, label) => {
    const data = fixture(effectTag);
    const html = renderToStaticMarkup(
      <CookingWorkspace
        data={data}
        section="delivery"
        onSectionChange={vi.fn()}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    expect(html).toContain(`정성 효과식 · ${label}`);
  });

  it("상시 납품은 요리와 판매 대금을 확인한 뒤에만 실행한다", async () => {
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingWorkspace
        data={fixture()}
        section="delivery"
        onSectionChange={vi.fn()}
        busy={false}
        mutate={mutate}
      />,
    );

    const sellButton = screen.getByRole("button", {
      name: /불향 토마토 샐러드.*1개 납품/,
    });
    fireEvent.click(sellButton);

    expect(screen.getByRole("dialog", { name: "요리 판매 확인" })).toBeTruthy();
    expect(screen.getByText("판매 후 1개")).toBeTruthy();
    expect(screen.getByText("1,600골드")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(sellButton);
    fireEvent.click(screen.getByRole("button", { name: "1개 판매 확정" }));

    await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
    expect(mutate).toHaveBeenCalledWith({
      action: "standing_delivery",
      foodId: expect.stringContaining("food2:tomato_salad:masterpiece:o1:s5"),
      quantity: 1,
    });
  });

  it("중복 오답은 재료 비소모 안내로 번역한다", () => {
    expect(cookingErrorText("duplicate_combination")).toContain("재료는 소비하지 않았습니다");
  });

  it("서버가 중복 오답을 판정하면 현재 조합의 연구 버튼을 막는다", async () => {
    const initial = fixture();
    let researchRequests = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/v2/cooking" && init?.method === "POST") {
        researchRequests += 1;
        return Response.json(
          { ok: false, error: "duplicate_combination" },
          { status: 409 },
        );
      }
      if (url === "/api/v2/cooking") return Response.json(initial);
      return Response.json({ ok: true });
    });

    render(
      <GameStateRefreshProvider refreshGameState={vi.fn(async () => undefined)}>
        <CookingPanel />
      </GameStateRefreshProvider>,
    );

    await screen.findByText("레시피 연구");
    fireEvent.click(screen.getByRole("button", { name: "밀×10" }));
    fireEvent.click(screen.getByRole("button", { name: "우유×10" }));
    fireEvent.click(screen.getByRole("button", { name: "이 조합 연구" }));

    const action = await screen.findByRole("button", {
      name: "이미 실패한 조합",
    });
    expect((action as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(action);
    expect(researchRequests).toBe(1);
  });

  it("요리 요청 제한은 잠시 기다리라는 안내로 번역한다", () => {
    expect(cookingErrorText("rate_limited")).toContain("잠시 후");
  });

  it("현재 레벨 구간 경험치를 계산한다", () => {
    expect(cookingLevelProgressView({ xp: 12_345, currentLevelXp: 10_000, nextLevelXp: 15_000 })).toEqual({ percent: 46.9, label: "2,345 / 5,000 XP" });
  });

  it("첫 연구 실패 결과에 실제 재료 차감과 획득 XP를 함께 표시한다", async () => {
    const initial = fixture();
    const failed: CookingResponse = {
      ...initial,
      cooking: { ...initial.cooking, xp: initial.cooking.xp + 4 },
      failedResearches: [{
        method: "grill",
        ingredientIds: ["farm:wheat", "farm:milk"],
        createdAt: NOW + 1_000,
      }],
      failedCookingDishes: initial.failedCookingDishes + 1,
      farmItems: { ...initial.farmItems, wheat: 9, milk: 9 },
      result: {
        action: "research",
        outcome: "failure",
        earnedXp: 4,
        failedDishCount: 1,
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/v2/cooking" && init?.method === "POST") {
        return Response.json(failed);
      }
      if (url === "/api/v2/cooking") {
        return Response.json(initial);
      }
      return Response.json({ ok: true });
    });

    render(
      <GameStateRefreshProvider refreshGameState={vi.fn(async () => undefined)}>
        <CookingPanel />
      </GameStateRefreshProvider>,
    );

    await screen.findByText("레시피 연구");
    fireEvent.click(screen.getByRole("button", { name: "밀×10" }));
    fireEvent.click(screen.getByRole("button", { name: "우유×10" }));
    fireEvent.click(screen.getByRole("button", { name: "이 조합 연구" }));

    await waitFor(() => {
      expect(screen.getByText(/조합 연구 실패/).textContent).toBe(
        "조합 연구 실패 · 선택 재료 각 1개 소비 · 요리 XP +4 · 실패 음식 +1",
      );
    });
  });
});
