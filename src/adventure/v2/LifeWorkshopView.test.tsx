// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LifeWorkshopMaxConfirmDialog,
  LifeWorkshopProcessingRecipeCard,
  RanchFeedRecipeCard,
  LifeWorkshopView,
  LifeWorkshopQuantityControls,
  groupWorkshopRecipesByOutput,
  lifeWorkshopErrorText,
  personalCraftGoldCostText,
} from "./LifeWorkshopView";
import { emptyLifeWorkshopState } from "./lifeWorkshop";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("생활 제작 해방 할인 표시", () => {
  it("서버가 준 기본 비용·할인율·실제 비용을 함께 표시한다", () => {
    expect(personalCraftGoldCostText({
      baseGoldCost: 1_000_000,
      goldCost: 900_000,
      liberationDiscountPct: 10,
    })).toBe("기본 1,000,000G → 실제 900,000G · 해방 할인 10%");
  });
});

describe("생활 조합 작업장 모바일 배치", () => {
  it("선택 탭은 중립 다크 표면과 amber 텍스트를 함께 렌더링한다", () => {
    const html = renderToStaticMarkup(<LifeWorkshopView onBack={vi.fn()} />);

    expect(html).toMatch(
      /<button[^>]*aria-pressed="true"[^>]*class="[^"]*dark:bg-zinc-800[^"]*dark:text-amber-300[^"]*"/,
    );
  });

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

describe("생활 가공 재료 선택", () => {
  const recipes = [
    {
      id: "pine_softwood",
      activity: "woodcutting" as const,
      inputId: "v2_timber",
      inputAmount: 10,
      outputId: "v2_processed_softwood" as const,
      outputAmount: 1,
      requiredLevel: 1,
      maxBatches: 67,
      greatSuccessPct: 5,
    },
    {
      id: "birch_softwood",
      activity: "woodcutting" as const,
      inputId: "v2_birch_log",
      inputAmount: 8,
      outputId: "v2_processed_softwood" as const,
      outputAmount: 1,
      requiredLevel: 10,
      maxBatches: 71,
      greatSuccessPct: 5,
    },
  ];

  it("같은 결과물을 만드는 원재료 레시피를 한 그룹으로 묶는다", () => {
    const hardwoodRecipe = {
      ...recipes[0],
      id: "willow_hardwood",
      inputId: "v2_willow_log",
      outputId: "v2_processed_hardwood" as const,
      requiredLevel: 20,
    };

    expect(
      groupWorkshopRecipesByOutput([...recipes, hardwoodRecipe]),
    ).toEqual([recipes, [hardwoodRecipe]]);
  });

  it("선택한 원재료의 보유량과 최대 횟수로 가공한다", () => {
    const onProcess = vi.fn();
    render(
      <LifeWorkshopProcessingRecipeCard
        recipes={recipes}
        level={70}
        materials={{ v2_timber: 672, v2_birch_log: 568 }}
        busy={false}
        onProcess={onProcess}
      />,
    );

    expect(screen.getAllByText("다듬은 목재 1개")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("다듬은 목재 재료 선택"), {
      target: { value: "birch_softwood" },
    });

    expect(screen.getByText("필요 Lv.10 · 보유 568개")).toBeTruthy();
    expect(screen.getByRole("button", { name: "최대 71회" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "1회 가공" }));
    expect(onProcess).toHaveBeenCalledWith("birch_softwood", 1);
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
          ingredientAmount: 5,
          unlocked: true,
          craftCount: 1,
          masteryStage: 1,
          batchLimit: 5,
          maxCraftable: 3,
          ownedFeed: 7,
          availableCropCount: 16,
          cropInventory: { wheat: 10, corn: 5, golden_wheat: 1 },
        }}
        busy={false}
        onCraft={vi.fn()}
      />,
    );

    expect(html).toContain("목장 용품");
    expect(html).toContain("배합 사료");
    expect(html).toContain("보유 7개");
    expect(html).toContain("작물 5개를 선택해 주세요");
    expect(html).toContain("보유 16개");
    expect(html).toContain("5개 완성");
    expect(html).toContain("밀");
    expect(html).toContain("옥수수");
  });

  it("선택한 1회분 작물 5개와 제작 횟수를 함께 전달한다", () => {
    const onCraft = vi.fn();
    render(
      <RanchFeedRecipeCard
        recipe={{
          id: "compound_feed",
          name: "배합 사료",
          outputAmount: 5,
          ingredientAmount: 5,
          unlocked: true,
          craftCount: 1,
          masteryStage: 1,
          batchLimit: 5,
          maxCraftable: 3,
          ownedFeed: 7,
          availableCropCount: 16,
          cropInventory: { wheat: 10, corn: 5, golden_wheat: 1 },
        }}
        busy={false}
        onCraft={onCraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "밀 1개 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "밀 1개 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "밀 1개 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "옥수수 1개 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "옥수수 1개 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "1회 제작" }));

    expect(onCraft).toHaveBeenCalledWith(1, { wheat: 3, corn: 2 });
  });

  it("제작 후 소진된 작물도 선택에서 뺄 때까지 표시한다", () => {
    const baseRecipe = {
      id: "compound_feed" as const,
      name: "배합 사료",
      outputAmount: 5,
      ingredientAmount: 5,
      unlocked: true,
      craftCount: 1,
      masteryStage: 1,
      batchLimit: 5,
      maxCraftable: 1,
      ownedFeed: 0,
      availableCropCount: 5,
      cropInventory: { wheat: 5 },
    };
    const { rerender } = render(
      <RanchFeedRecipeCard
        recipe={baseRecipe}
        busy={false}
        onCraft={vi.fn()}
      />,
    );

    for (let count = 0; count < 5; count += 1) {
      fireEvent.click(screen.getByRole("button", { name: "밀 1개 추가" }));
    }
    rerender(
      <RanchFeedRecipeCard
        recipe={{
          ...baseRecipe,
          ownedFeed: 5,
          availableCropCount: 0,
          cropInventory: {},
        }}
        busy={false}
        onCraft={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "밀 1개 빼기" })).toBeTruthy();
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
        ingredientAmount: 5,
        unlocked: false,
        craftCount: 0,
        masteryStage: 0,
        batchLimit: 1,
        maxCraftable: 0,
        ownedFeed: 0,
        availableCropCount: 0,
        cropInventory: {},
      },
      failedDishFeedRecipe: {
        id: "failed_dish_feed",
        name: "재활용 배합 사료",
        outputAmount: 5,
        failedDishCost: 25,
        craftCount: 1,
        masteryStage: 1,
        batchLimit: 5,
        maxCraftable: 0,
        ownedFeed: 0,
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<LifeWorkshopView onBack={vi.fn()} initialTab="craft" />);

    await waitFor(() => expect(screen.getByText("실패 음식 퇴비")).toBeTruthy());
    expect(screen.getByText("실패 음식 3개 (보유 8개)")).toBeTruthy();
  });

  it("실패 음식으로 만드는 사료의 비용과 생산량을 보여준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      state: emptyLifeWorkshopState(),
      levels: { woodcutting: 1, mining: 1 },
      materials: {},
      failedCookingDishes: 51,
      gold: 0,
      bankedGold: 0,
      recipes: [],
      tools: [
        { activity: "woodcutting", tier: 0, name: "낡은 벌목 도구", durationReductionPct: 0, bonusMaterialPct: 0, nextUpgrade: null },
        { activity: "mining", tier: 0, name: "낡은 채광 도구", durationReductionPct: 0, bonusMaterialPct: 0, nextUpgrade: null },
      ],
      craftingRecipes: [],
      ranchCraftingRecipe: {
        id: "compound_feed",
        name: "배합 사료",
        outputAmount: 5,
        ingredientAmount: 5,
        unlocked: false,
        craftCount: 0,
        masteryStage: 0,
        batchLimit: 1,
        maxCraftable: 0,
        ownedFeed: 3,
        availableCropCount: 0,
        cropInventory: {},
      },
      failedDishFeedRecipe: {
        id: "failed_dish_feed",
        name: "재활용 배합 사료",
        outputAmount: 5,
        failedDishCost: 25,
        craftCount: 0,
        masteryStage: 0,
        batchLimit: 1,
        maxCraftable: 1,
        ownedFeed: 3,
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<LifeWorkshopView onBack={vi.fn()} initialTab="craft" />);

    const recipeName = await screen.findByText("재활용 배합 사료");
    expect(screen.getByText(/실패 음식 25개/).textContent).toContain("보유 51개");
    expect(recipeName.closest(".ui-game-card")?.textContent).toContain(
      "1회 제작 시 5개 완성",
    );
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
