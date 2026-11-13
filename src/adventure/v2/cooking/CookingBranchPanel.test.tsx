// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GameDialogHost } from "@/components/ui/GameDialogHost";
import { CookingBranchPanel } from "./CookingBranchPanel";
import type { CookingBranchView, CookingResponse } from "./clientTypes";

const NOW = Date.parse("2026-11-13T12:00:00+09:00");
const DAY = 86_400_000;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fixture(options: {
  branch?: Partial<CookingBranchView>;
  specialty?: { field: string; xp: number } | null;
  farm?: Record<string, number>;
  kitchen?: Record<string, number>;
  level?: number;
} = {}): CookingResponse {
  return {
    now: NOW,
    level: options.level ?? 40,
    cooking: {
      specialty: options.specialty === undefined ? { field: "baking", xp: 1_500 } : options.specialty,
    },
    branch: {
      eligible: true,
      current: null,
      rank: 0,
      xp: 0,
      nextRankXp: null,
      xpByBranch: {},
      nextChangeAt: null,
      masterpieceBonusPct: 0,
      ...options.branch,
    },
    farmItems: options.farm ?? {},
    fishingItems: {},
    kitchenItems: options.kitchen ?? {},
    farmItemDefinitions: {
      wheat: { name: "밀" },
      milk: { name: "우유" },
      egg: { name: "달걀" },
      potato: { name: "감자" },
      golden_wheat: { name: "황금 밀" },
    },
    fishingItemDefinitions: {},
    pantryItems: [{ id: "pantry:yeast", name: "효모" }],
    processingRecipes: [
      { outputId: "processed:cheese", name: "치즈" },
      { outputId: "processed:butter", name: "버터" },
    ],
  } as unknown as CookingResponse;
}

function renderPanel(data: CookingResponse, busy = false) {
  const mutate = vi.fn(async () => undefined);
  render(
    <>
      <GameDialogHost />
      <CookingBranchPanel data={data} busy={busy} mutate={mutate} />
    </>,
  );
  return { mutate };
}

describe("요리 특화 패널", () => {
  it("전문 랭크 5 전에는 조건만 알려 준다", () => {
    renderPanel(fixture({ branch: { eligible: false }, specialty: { field: "baking", xp: 700 } }));

    expect(screen.getByText("전문 분야 랭크 5가 되면 전문 분야 안에서 특화를 고를 수 있습니다.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("고르기 전에는 자기 전문 분야의 특화와 전용 요리를 보여 준다", () => {
    renderPanel(fixture());

    expect(screen.getAllByTestId(/^cooking-branch-option-/)).toHaveLength(3);
    const bread = within(screen.getByTestId("cooking-branch-option-baking_bread"));
    expect(bread.getByText("제빵")).toBeTruthy();
    expect(bread.getByText("발효 요리")).toBeTruthy();
    expect(bread.getByText(/제빵장의 황금 밀 브리오슈/)).toBeTruthy();
    expect(bread.getByText(/최대 MP \+1000/)).toBeTruthy();
    expect(screen.queryByTestId("cooking-branch-option-hearth_grill")).toBeNull();
    expect(screen.queryByTestId("cooking-branch-option-pot_soup")).toBeNull();
  });

  it("확인을 거쳐 특화를 고른다", async () => {
    const { mutate } = renderPanel(fixture());

    fireEvent.click(screen.getByRole("button", { name: "제빵 특화 선택" }));
    expect(mutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "선택" }));

    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ action: "choose_branch", branchId: "baking_bread" }),
    );
  });

  it("고른 뒤에는 랭크와 숙련 진행, 걸작 보너스를 보여 준다", () => {
    renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 3, xp: 3_400, nextRankXp: 7_000, masterpieceBonusPct: 6, xpByBranch: { baking_bread: 3_400 } },
      }),
    );

    expect(screen.getByText("제빵 특화 · 랭크 3")).toBeTruthy();
    expect(screen.getByText("특화 숙련 3,400 / 7,000")).toBeTruthy();
    expect(screen.getByText("걸작 확률 +6%p")).toBeTruthy();
    expect(screen.queryByTestId("cooking-branch-option-baking_pastry")).toBeNull();
    expect(screen.getAllByTestId(/^cooking-branch-dish-/)).toHaveLength(3);
  });

  it("최고 랭크면 다음 요구량 대신 최고 랭크를 적는다", () => {
    renderPanel(
      fixture({ branch: { current: "baking_bread", rank: 5, xp: 16_200, nextRankXp: null, masterpieceBonusPct: 10 } }),
    );

    expect(screen.getByText("제빵 특화 · 랭크 5")).toBeTruthy();
    expect(screen.getByText("특화 숙련 16,200 · 최고 랭크")).toBeTruthy();
  });

  it("전용 요리의 재료 보유량을 보여 주고 충분하면 제작을 요청한다", () => {
    const { mutate } = renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 1, xp: 0, nextRankXp: 1_000, masterpieceBonusPct: 2 },
        farm: { wheat: 40, milk: 12, egg: 30 },
        kitchen: { "pantry:yeast": 3 },
      }),
    );
    const dish = within(screen.getByTestId("cooking-branch-dish-branch_baking_bread_1"));

    expect(dish.getByText("천천히 부풀린 시골 빵")).toBeTruthy();
    expect(dish.getByText("INT +6 · 최대 MP +400")).toBeTruthy();
    expect(dish.getByText("밀 40 / 12")).toBeTruthy();
    expect(dish.getByText("효모 3 / 3")).toBeTruthy();
    fireEvent.click(dish.getByRole("button", { name: "천천히 부풀린 시골 빵 제작" }));

    expect(mutate).toHaveBeenCalledWith({ action: "craft", recipeId: "branch_baking_bread_1", quantity: 1 });
  });

  it("수량을 올리면 필요한 재료가 늘고 모자라면 버튼을 끈다", () => {
    const { mutate } = renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 1, xp: 0, nextRankXp: 1_000, masterpieceBonusPct: 2 },
        farm: { wheat: 40, milk: 12, egg: 30 },
        kitchen: { "pantry:yeast": 3 },
      }),
    );
    fireEvent.change(screen.getByLabelText("제작 수량"), { target: { value: "2" } });
    const dish = within(screen.getByTestId("cooking-branch-dish-branch_baking_bread_1"));

    expect(dish.getByText("밀 40 / 24").className).not.toContain("text-rose-600");
    expect(dish.getByText("우유 12 / 24").className).toContain("text-rose-600");
    const button = dish.getByRole("button", { name: "천천히 부풀린 시골 빵 제작" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("랭크가 모자란 전용 요리는 요구 랭크를 적고 잠근다", () => {
    renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 2, xp: 1_500, nextRankXp: 3_000, masterpieceBonusPct: 4 },
        farm: { wheat: 999, milk: 999, egg: 999, potato: 999, golden_wheat: 99 },
        kitchen: { "pantry:yeast": 99, "processed:cheese": 99, "processed:butter": 99 },
      }),
    );
    const second = within(screen.getByTestId("cooking-branch-dish-branch_baking_bread_2"));
    const third = within(screen.getByTestId("cooking-branch-dish-branch_baking_bread_3"));

    expect(second.getByText("특화 랭크 3에서 열립니다.")).toBeTruthy();
    expect(third.getByText("특화 랭크 5에서 열립니다.")).toBeTruthy();
    expect((second.getByRole("button", { name: "치즈 품은 발효 식빵 제작" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (within(screen.getByTestId("cooking-branch-dish-branch_baking_bread_1")).getByRole("button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("변경을 누르면 다른 특화를 고를 수 있고 대기 중이면 날짜를 알려 준다", async () => {
    const { mutate } = renderPanel(
      fixture({
        branch: {
          current: "baking_bread",
          rank: 3,
          xp: 3_400,
          nextRankXp: 7_000,
          masterpieceBonusPct: 6,
          xpByBranch: { baking_bread: 3_400, baking_pastry: 1_200 },
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "특화 변경" }));

    expect(screen.queryByTestId("cooking-branch-option-baking_bread")).toBeNull();
    const pastry = within(screen.getByTestId("cooking-branch-option-baking_pastry"));
    expect(pastry.getByText("쌓아 둔 숙련 1,200 · 랭크 2")).toBeTruthy();
    fireEvent.click(pastry.getByRole("button", { name: "제과 특화 선택" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/14일 동안 다시 바꿀 수 없습니다/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "변경" }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({ action: "choose_branch", branchId: "baking_pastry" }),
    );
    cleanup();

    renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 1, xp: 0, nextRankXp: 1_000, masterpieceBonusPct: 2, nextChangeAt: NOW + 13 * DAY },
      }),
    );
    expect(screen.getByText("11월 26일부터 변경할 수 있습니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "특화 변경" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("요청 중에는 버튼을 끈다", () => {
    renderPanel(
      fixture({
        branch: { current: "baking_bread", rank: 1, xp: 0, nextRankXp: 1_000, masterpieceBonusPct: 2 },
        farm: { wheat: 40, milk: 40, egg: 40 },
        kitchen: { "pantry:yeast": 9 },
      }),
      true,
    );

    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
