// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LifeWorkshopMaxConfirmDialog,
  RanchFeedRecipeCard,
  LifeWorkshopView,
  LifeWorkshopQuantityControls,
  lifeWorkshopErrorText,
} from "./LifeWorkshopView";
import { emptyLifeWorkshopState } from "./lifeWorkshop";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("생활 조합 작업장 모바일 배치", () => {
  it("터치 기기에서 상단 메뉴를 네 칸으로 되돌릴 수 있는 표식을 둔다", () => {
    const html = renderToStaticMarkup(<LifeWorkshopView onBack={vi.fn()} />);

    expect(html).toContain("life-workshop-touch-tabs");
  });

  it("직접 제작 경로는 첫 렌더부터 생활 제작 탭을 선택한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopView onBack={vi.fn()} initialTab="craft" />,
    );

    expect(html).toMatch(/aria-pressed="true"[^>]*>생활 제작<\/button>/);
  });
});

describe("목장 사료 제작 카드", () => {
  it("공용 사료의 재료, 생산량, 보유량과 제작 수량을 보여준다", () => {
    const html = renderToStaticMarkup(
      <RanchFeedRecipeCard
        recipe={{
          id: "compound_feed",
          name: "배합 사료",
          outputAmount: 5,
          costs: { wheat: 4, corn: 3, herb: 1 },
          unlocked: true,
          craftCount: 1,
          masteryStage: 1,
          batchLimit: 5,
          maxCraftable: 2,
          ownedFeed: 7,
          ingredientBalances: { wheat: 8, corn: 6, herb: 2 },
        }}
        busy={false}
        onCraft={vi.fn()}
      />,
    );

    expect(html).toContain("목장 용품");
    expect(html).toContain("배합 사료");
    expect(html).toContain("보유 7개");
    expect(html).toContain("밀 4개");
    expect(html).toContain("옥수수 3개");
    expect(html).toContain("허브 1개");
    expect(html).toContain("5개 완성");
    expect(html).toContain('max="2"');
  });
});

describe("생활 조합 작업장 오류 안내", () => {
  it("요청 제한의 남은 대기 시간을 알려준다", () => {
    expect(
      lifeWorkshopErrorText({ error: "rate_limited", retryAfterSec: 24 }),
    ).toBe("요청이 너무 많습니다. 24초 후 다시 시도해 주세요.");
  });

  it("생활 레벨 제한 안내를 유지한다", () => {
    expect(
      lifeWorkshopErrorText({ error: "level_required", requiredLevel: 20 }),
    ).toBe("생활 레벨이 부족합니다. (필요 Lv.20)");
  });

  it("퇴비 제작에 필요한 실패 음식 부족을 안내한다", () => {
    expect(
      lifeWorkshopErrorText({ error: "not_enough_failed_dishes" }),
    ).toBe("실패 음식이 부족합니다.");
  });
});

describe("실패 음식 퇴비 제작 카드", () => {
  it("실패 음식 비용과 현재 보유량을 보여준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      state: emptyLifeWorkshopState(),
      levels: { woodcutting: 1, mining: 1 },
      materials: {},
      failedCookingDishes: 8,
      gold: 0,
      bankedGold: 0,
      recipes: [],
      tools: [
        { activity: "woodcutting", tier: 0, name: "낡은 벌목 도구", durationReductionPct: 0, bonusMaterialPct: 0, nextUpgrade: null },
        { activity: "mining", tier: 0, name: "낡은 채광 도구", durationReductionPct: 0, bonusMaterialPct: 0, nextUpgrade: null },
      ],
      craftingRecipes: [{
        id: "failed_dish_compost",
        name: "실패 음식 퇴비",
        description: "실패한 요리를 발효해 유기질 거름으로 되살립니다.",
        image: "/images/items/life-aids/organic_fertilizer.webp",
        kind: "aid",
        outputId: "organic_fertilizer",
        outputAmount: 1,
        costs: {},
        failedDishCost: 3,
        requiredLevel: 1,
        learned: true,
        craftCount: 1,
        masteryStage: 1,
        batchLimit: 5,
        maxCraftable: 2,
      }],
      ranchCraftingRecipe: {
        id: "compound_feed",
        name: "배합 사료",
        outputAmount: 5,
        costs: { wheat: 4, corn: 3, herb: 1 },
        unlocked: false,
        craftCount: 0,
        masteryStage: 0,
        batchLimit: 1,
        maxCraftable: 0,
        ownedFeed: 0,
        ingredientBalances: { wheat: 0, corn: 0, herb: 0 },
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<LifeWorkshopView onBack={vi.fn()} initialTab="craft" />);

    await waitFor(() => expect(screen.getByText("실패 음식 퇴비")).toBeTruthy());
    expect(screen.getByText("실패 음식 3개 (보유 8개)")).toBeTruthy();
  });
});

describe("생활 조합 작업장 수량 선택", () => {
  it("1개, 10개, 최대 빠른 제작과 직접 입력을 함께 제공한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopQuantityControls
        maxQuantity={37}
        unit="개"
        actionLabel="제작"
        inputLabel="쐐기 제작 수량"
        busy={false}
        onSubmit={vi.fn()}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(text).toContain("1개");
    expect(text).toContain("10개");
    expect(text).toContain("최대 37개");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="쐐기 제작 수량"');
    expect(html).toContain('max="37"');
    expect(text).toContain("1개 제작");
  });

  it("최대 수량은 별도 확인 창에서 실행량을 다시 안내한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopMaxConfirmDialog
        quantity={37}
        unit="개"
        actionLabel="제작"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(html).toContain('role="dialog"');
    expect(text).toContain("최대 37개를 제작할까요?");
    expect(text).toContain("현재 보유 재료로 가능한 최대 수량");
    expect(text).toContain("취소");
    expect(text).toContain("최대 37개 제작");
  });

  it("10회분이 없으면 10회 빠른 가공을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopQuantityControls
        maxQuantity={4}
        unit="회"
        actionLabel="가공"
        inputLabel="목재 가공 수량"
        busy={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>[\s\S]*?10회[\s\S]*?<\/button>/,
    );
    expect(html).toContain("최대 4회");
    expect(html).toContain('max="4"');
  });
});
