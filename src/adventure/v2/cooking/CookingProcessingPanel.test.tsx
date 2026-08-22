// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FARM_ITEMS } from "../farm";
import { CookingProcessingPanel } from "./CookingProcessingPanel";
import type { CookingResponse } from "./clientTypes";
import { COOKING_PANTRY_ITEMS, COOKING_PROCESSING_RECIPES } from "./kitchen";

afterEach(cleanup);

function processingFixture(): CookingResponse {
  return {
    pantryItems: [...COOKING_PANTRY_ITEMS],
    processingRecipes: [...COOKING_PROCESSING_RECIPES],
    kitchenItems: {},
    farmItems: { wheat: 12 },
    farmItemDefinitions: FARM_ITEMS,
  } as unknown as CookingResponse;
}

describe("요리 재료 가공 수량", () => {
  it("상점 구매 수량과 총액을 조절한다", () => {
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingProcessingPanel
        data={processingFixture()}
        busy={false}
        mutate={mutate}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "소금 구매 수량" }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "7개 · 350골드 구매" }));

    expect(mutate).toHaveBeenCalledWith({
      action: "buy_pantry",
      itemId: "pantry:salt",
      quantity: 7,
    });
  });

  it("보유 재료 한도 안에서 가공 수량과 필요량을 조절한다", () => {
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingProcessingPanel
        data={processingFixture()}
        busy={false}
        mutate={mutate}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "밀가루 가공 수량" });
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.blur(input);

    expect((input as HTMLInputElement).value).toBe("4");
    expect(screen.getByText("밀 12개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4개 가공" }));

    expect(mutate).toHaveBeenCalledWith({
      action: "process",
      itemId: "processed:flour",
      quantity: 4,
    });
  });
});
