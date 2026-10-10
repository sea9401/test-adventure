// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { COOKING_PUBLIC_RECIPES } from "./catalog";
import type { CookingResponse } from "./clientTypes";
import { CookingSignaturePanel } from "./CookingSignaturePanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const land = COOKING_PUBLIC_RECIPES.find((recipe) => recipe.field !== "seafood")!;
const sea = COOKING_PUBLIC_RECIPES.find((recipe) => recipe.field === "seafood")!;
const landId = `food2:${land.id}:masterpiece:o0:s0`;
const seaId = `food2:${sea.id}:masterpiece:o0:s0`;
const carefulId = `food2:${land.id}:careful:o0:s0`;

function fixture(products: { crop: number; catch: number }): CookingResponse {
  return {
    cookingFoods: { [landId]: 2, [seaId]: 1, [carefulId]: 4 },
    cookingFoodDefinitions: {
      [landId]: { recipe: land, name: `${land.name} (걸작)`, quality: "masterpiece" },
      [seaId]: { recipe: sea, name: `${sea.name} (걸작)`, quality: "masterpiece" },
      [carefulId]: { recipe: land, name: `${land.name} (정성작)`, quality: "careful" },
    },
    signature: { unlocked: true, stage: 3, requiredStage: 3, products },
  } as unknown as CookingResponse;
}

describe("명장 요리 패널", () => {
  it("보유 걸작만 보여 주고 레시피 분야에 맞는 명장 산물을 안내한다", () => {
    render(<CookingSignaturePanel data={fixture({ crop: 1, catch: 0 })} busy={false} mutate={vi.fn()} />);
    expect(screen.queryByText(`${land.name} (정성작)`)).toBeNull();
    const landRow = screen.getByTestId(`signature-${landId}`);
    expect(within(landRow).getByText(/명장 작물 1개 필요 · 보유 1/)).toBeTruthy();
    expect((within(landRow).getByRole("button", { name: "명장 요리로" }) as HTMLButtonElement).disabled).toBe(false);
    const seaRow = screen.getByTestId(`signature-${seaId}`);
    expect(within(seaRow).getByText(/명장 어획 1개 필요 · 보유 0/)).toBeTruthy();
    expect((within(seaRow).getByRole("button", { name: "명장 요리로" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("버튼을 누르면 명장 요리 만들기를 요청한다", () => {
    const mutate = vi.fn();
    render(<CookingSignaturePanel data={fixture({ crop: 1, catch: 1 })} busy={false} mutate={mutate} />);
    fireEvent.click(within(screen.getByTestId(`signature-${landId}`)).getByRole("button", { name: "명장 요리로" }));
    expect(mutate).toHaveBeenCalledWith({ action: "signature", foodId: landId });
  });

  it("걸작이 없으면 빈 상태를 안내한다", () => {
    const data = { ...fixture({ crop: 1, catch: 1 }), cookingFoods: {} } as CookingResponse;
    render(<CookingSignaturePanel data={data} busy={false} mutate={vi.fn()} />);
    expect(screen.getByText("보유한 걸작 요리가 없습니다")).toBeTruthy();
  });
});
