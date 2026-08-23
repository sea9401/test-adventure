// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FARM_ITEMS, type FarmItemInventory } from "../farm";
import { CookingResearchPanel } from "./CookingResearchPanel";
import type { CookingFailedResearchView, CookingResponse } from "./clientTypes";

const NOW = Date.parse("2026-08-23T15:00:00+09:00");

afterEach(cleanup);

function researchFixture(
  farmItems: FarmItemInventory,
  failedResearches: CookingFailedResearchView[] = [],
): CookingResponse {
  return {
    level: 1,
    farmItems,
    farmItemDefinitions: FARM_ITEMS,
    fishingItems: {},
    fishingItemDefinitions: {},
    kitchenItems: {},
    pantryItems: [],
    processingRecipes: [],
    failedResearches,
  } as unknown as CookingResponse;
}

describe("요리 레시피 연구 재료 선택", () => {
  it("최근 실패 기록에서 조리법과 사용한 재료를 확인한다", () => {
    const view = render(
      <CookingResearchPanel
        data={researchFixture({ wheat: 1, milk: 1 }, [{
          method: "grill",
          ingredientIds: ["farm:wheat", "farm:milk"],
          createdAt: NOW,
        }])}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    const notebook = screen.getByRole("region", { name: "최근 실패 기록" });
    expect(within(notebook).getByText("굽기")).toBeTruthy();
    expect(within(notebook).getByText("밀 · 우유")).toBeTruthy();
    expect(view.container.querySelector("time")?.dateTime).toBe(
      "2026-08-23T06:00:00.000Z",
    );
    expect(screen.getByText(/성공한 조합은 요리 도감/)).toBeTruthy();
  });

  it("이미 실패한 조합을 선택하면 연구 요청을 보내지 않는다", () => {
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingResearchPanel
        data={researchFixture({ wheat: 1, milk: 1 }, [{
          method: "grill",
          ingredientIds: ["farm:milk", "farm:wheat"],
          createdAt: NOW,
        }])}
        busy={false}
        mutate={mutate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "밀×1" }));
    fireEvent.click(screen.getByRole("button", { name: "우유×1" }));

    const action = screen.getByRole("button", { name: "이미 실패한 조합" });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "재료는 소비되지 않습니다",
    );
    fireEvent.click(action);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("연구 후 소진되어 사라진 재료를 선택 상태에서도 제거한다", async () => {
    const mutate = vi.fn(async () => undefined);
    const view = render(
      <CookingResearchPanel
        data={researchFixture({ wheat: 1, milk: 2, tomato: 1 })}
        busy={false}
        mutate={mutate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "밀×1" }));
    fireEvent.click(screen.getByRole("button", { name: "우유×2" }));
    fireEvent.click(screen.getByRole("button", { name: "이 조합 연구" }));
    expect(mutate).toHaveBeenLastCalledWith({
      action: "research",
      method: "grill",
      ingredientIds: ["farm:wheat", "farm:milk"],
    });

    view.rerender(
      <CookingResearchPanel
        data={researchFixture({ milk: 1, tomato: 1 })}
        busy={false}
        mutate={mutate}
      />,
    );

    await waitFor(() => expect(screen.getByText("선택 1/2")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "토마토×1" }));
    fireEvent.click(screen.getByRole("button", { name: "이 조합 연구" }));

    expect(mutate).toHaveBeenLastCalledWith({
      action: "research",
      method: "grill",
      ingredientIds: ["farm:milk", "farm:tomato"],
    });
  });
});
