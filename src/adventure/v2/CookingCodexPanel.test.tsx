// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { CookingCodexPanel } from "./CookingCodexPanel";
import { COOKING_PUBLIC_RECIPES } from "./cooking/catalog";

afterEach(cleanup);

describe("모험의 서 요리 완성 도감", () => {
  it("등록 수, 업적 효과 안내, 등록 여부를 함께 보여준다", () => {
    render(<CookingCodexPanel discoveredIds={["rustic_bread"]} />);

    expect(screen.getByText("요리 완성 도감")).toBeTruthy();
    expect(
      screen.getByText(`1 / ${COOKING_PUBLIC_RECIPES.length}`),
    ).toBeTruthy();
    expect(
      screen.getByText(/별도의 능력치나 SP를 직접 지급하지는 않습니다/),
    ).toBeTruthy();
    expect(screen.getByText("첫 조리 연구")).toBeTruthy();
    expect(screen.getByText("투박한 밀빵")).toBeTruthy();
    expect(screen.getByText("도감 등록")).toBeTruthy();
    expect(screen.getAllByText("미등록").length).toBeGreaterThan(0);
  });

  it("요리 레벨 구간 없이 발견한 레시피를 미발견 레시피보다 먼저 보여준다", () => {
    render(<CookingCodexPanel discoveredIds={["herb_pickles"]} />);

    const list = screen.getByRole("list", { name: "요리 레시피 목록" });
    const recipes = within(list).getAllByRole("listitem");

    expect(recipes[0].textContent).toContain("새콤한 허브 절임");
    expect(screen.queryByRole("heading", { name: /^요리 Lv/ })).toBeNull();
  });

  it("레시피를 20개씩 보여주고 다음 페이지로 이동한다", () => {
    render(<CookingCodexPanel discoveredIds={[]} />);

    const list = screen.getByRole("list", { name: "요리 레시피 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(
      screen.getByRole("navigation", { name: "페이지 네비게이션" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));

    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(
      screen
        .getByRole("button", { name: "2 페이지" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});
