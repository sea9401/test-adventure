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
    knownRecipes: discoveredRecipeIds.map((id) => ({
      id,
      discovery: "hidden",
    })),
  } as unknown as CookingResponse;
}

const NOW = new Date("2026-11-14T03:00:00.000Z").getTime();

function selectedSpecialtyFixture(
  xp: number,
  extra: Record<string, unknown> = {},
): CookingResponse {
  return {
    now: NOW,
    level: 20,
    cooking: {
      discoveredRecipeIds: [],
      specialty: { field: "pot", xp },
      ...extra,
    },
    knownRecipes: [],
  } as unknown as CookingResponse;
}

describe("CookingSpecialtyPanel 전문 분야 선택", () => {
  it("최대 랭크에만 MAX를 표시한다", () => {
    const props = {
      busy: false,
      mutate: vi.fn(async () => undefined),
    };
    const { rerender } = render(
      <CookingSpecialtyPanel data={selectedSpecialtyFixture(1_499)} {...props} />,
    );

    expect(screen.getByText("냄비 전문 · 랭크 4")).toBeTruthy();
    expect(screen.queryByText(/\(MAX\)/)).toBeNull();

    rerender(
      <CookingSpecialtyPanel data={selectedSpecialtyFixture(3_020)} {...props} />,
    );

    expect(screen.getByText("냄비 전문 · 랭크 5 (MAX)")).toBeTruthy();
  });

  it("브라우저 확인창 대신 게임 내 선택 모달을 사용한다", () => {
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
      screen.getByText("나중에 바꿀 수 있지만, 바꾼 뒤에는 1일 동안 다시 바꿀 수 없습니다."),
    ).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "약선" }));
    fireEvent.click(screen.getByRole("button", { name: "약선 전문 선택" }));

    expect(mutate).toHaveBeenCalledWith({
      action: "choose_specialty",
      field: "medicinal",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CookingSpecialtyPanel 전문 분야 변경", () => {
  it("다른 분야를 남겨 둔 숙련과 함께 보여 주고 확인 뒤 변경을 요청한다", () => {
    const mutate = vi.fn(async () => undefined);
    render(
      <CookingSpecialtyPanel
        data={selectedSpecialtyFixture(17_460, { specialtyReserve: { baking: 1_800 } })}
        busy={false}
        mutate={mutate}
      />,
    );

    // 지금 고른 분야는 변경 목록에 없다.
    expect(screen.queryByRole("button", { name: /냄비/ })).toBeNull();
    expect(screen.getByRole("button", { name: "제과 · 숙련 1,800" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "화덕 · 숙련 0" }));

    const dialog = screen.getByRole("dialog", { name: "화덕 전문으로 바꿀까요?" });
    expect(dialog.textContent).toContain("1일 동안 다시 바꿀 수 없습니다");
    expect(dialog.textContent).toContain("냄비 숙련 17,460은 그대로 남고");
    expect(dialog.textContent).toContain("고른 특화는 풀립니다");
    expect(dialog.textContent).toContain("화덕 숙련은 0부터 쌓습니다");
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "화덕 전문으로 변경" }));
    expect(mutate).toHaveBeenCalledWith({ action: "choose_specialty", field: "hearth" });
  });

  it("남겨 둔 숙련이 있는 분야는 이어서 쌓는다고 알린다", () => {
    render(
      <CookingSpecialtyPanel
        data={selectedSpecialtyFixture(300, { specialtyReserve: { baking: 1_800 } })}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "제과 · 숙련 1,800" }));
    expect(screen.getByRole("dialog").textContent).toContain("제과 숙련은 1,800에서 이어 쌓습니다");
  });

  it("바꾼 지 1일이 안 됐으면 변경을 막고 가능한 시각을 알린다", () => {
    render(
      <CookingSpecialtyPanel
        data={selectedSpecialtyFixture(300, { specialtyChangedAt: NOW - 3_600_000 })}
        busy={false}
        mutate={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByText("11월 15일 11:00부터 변경할 수 있습니다.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "화덕 · 숙련 0" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
