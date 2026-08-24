// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CookingSpecialtyPanel } from "./CookingSpecialtyPanel";
import type { CookingResponse } from "./clientTypes";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function eligibleSpecialtyFixture(): CookingResponse {
  const discoveredRecipeIds = Array.from(
    { length: 10 },
    (_, index) => `hidden-${index}`,
  );
  return {
    level: 20,
    cooking: {
      discoveredRecipeIds,
      specialty: null,
    },
    recipes: discoveredRecipeIds.map((id) => ({
      id,
      discovery: "hidden",
    })),
  } as unknown as CookingResponse;
}

describe("CookingSpecialtyPanel 전문 분야 선택", () => {
  it("브라우저 확인창 대신 게임 내 영구 선택 모달을 사용한다", () => {
    const mutate = vi.fn(async () => undefined);
    const browserConfirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <CookingSpecialtyPanel
        data={eligibleSpecialtyFixture()}
        busy={false}
        mutate={mutate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "약선" }));

    expect(browserConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "약선 전문을 선택할까요?" })).toBeTruthy();
    expect(
      screen.getByText("선택 후에는 전문 분야를 변경하거나 초기화할 수 없습니다."),
    ).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "약선" }));
    fireEvent.click(screen.getByRole("button", { name: "약선 영구 선택" }));

    expect(mutate).toHaveBeenCalledWith({
      action: "choose_specialty",
      field: "medicinal",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
