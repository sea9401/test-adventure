// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MuseunCoinShopView } from "./MuseunCoinShopView";

const SUPPORT_NAMES = [
  "월간 모험 지원권 프리미엄 (30일)",
  "월간 모험 지원권 (30일)",
  "월간 스태미나 회복약 세트",
  "성장 도약 패키지",
];
const PROFILE_NAMES = [
  "대표 배지 전시대",
  "개명 허가증",
  "프로필 이미지 변경권",
];

function shownItemNames(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent ?? "");
}

describe("무슨 코인 상점 종류 탭", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => null })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("처음에는 모험 지원 탭의 상품만 보여 준다", () => {
    render(<MuseunCoinShopView />);

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["모험 지원", "꾸미기", "프로필·계정"]);
    expect(
      screen.getByRole("tab", { name: "모험 지원" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(shownItemNames()).toEqual(SUPPORT_NAMES);
  });

  it("탭을 누르면 그 종류의 상품만 보여 준다", () => {
    render(<MuseunCoinShopView />);

    fireEvent.click(screen.getByRole("tab", { name: "프로필·계정" }));

    expect(
      screen.getByRole("tab", { name: "프로필·계정" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(shownItemNames()).toEqual(PROFILE_NAMES);

    fireEvent.click(screen.getByRole("tab", { name: "꾸미기" }));

    expect(shownItemNames()).toHaveLength(4);
    expect(shownItemNames()).not.toContain("개명 허가증");
    expect(shownItemNames()).not.toContain("월간 모험 지원권 (30일)");
  });

  it("보유 코인과 충전 버튼은 어느 탭에서도 보인다", () => {
    render(<MuseunCoinShopView />);

    fireEvent.click(screen.getByRole("tab", { name: "꾸미기" }));

    expect(screen.getByText(/무슨 코인 0개/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "충전" })).toBeTruthy();
  });
});
