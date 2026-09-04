// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CookingPublicDiscoveryPanel } from "./CookingPublicDiscoveryPanel";

afterEach(cleanup);

const discoveries = Array.from({ length: 22 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    recipeName: `공개 요리 ${number}`,
    imageSrc: `/images/items/cooking/recipe-${number}.webp`,
    actorName: `발견자 ${number}`,
    discoveredAt: index + 1,
    codexRegistered: index === 21,
  };
});

describe("공개 요리 발견 패널", () => {
  it("공개 정보만 최근 발견순으로 20개씩 보여준다", () => {
    const { container } = render(
      <CookingPublicDiscoveryPanel discoveries={discoveries} />,
    );

    expect(
      screen.getByRole("heading", { name: "공개 발견 요리" }),
    ).toBeTruthy();
    expect(screen.getByText("공개된 요리 22개")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(20);
    expect(screen.getByText("공개 요리 22")).toBeTruthy();
    expect(screen.getByText("최초 발견자: 발견자 22")).toBeTruthy();
    expect(container.querySelector('img[src*="recipe-22.webp"]')).toBeTruthy();
    expect(screen.queryByText(/비밀 재료|조리법|효과|등급|필요 레벨/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2 페이지" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("공개 요리 01")).toBeTruthy();
  });

  it("공개된 요리가 없으면 빈 상태를 보여준다", () => {
    render(
      <CookingPublicDiscoveryPanel discoveries={[]} />,
    );

    expect(screen.getByText("아직 공개된 요리가 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("정렬을 고르면 결과를 바꾸고 첫 페이지로 돌아간다", async () => {
    render(
      <CookingPublicDiscoveryPanel discoveries={discoveries} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2 페이지" }));
    expect(
      screen
        .getByRole("button", { name: "2 페이지" })
        .getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.change(
      screen.getByRole("combobox", { name: "공개 발견 정렬" }),
      { target: { value: "recipe_name" } },
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "1 페이지" })
          .getAttribute("aria-current"),
      ).toBe("page"),
    );
    expect(screen.getAllByRole("article")[0].textContent).toContain(
      "공개 요리 01",
    );
  });

  it("도감 미등록을 고르면 등록된 요리를 제외하고 첫 페이지로 돌아간다", async () => {
    render(<CookingPublicDiscoveryPanel discoveries={discoveries} />);
    fireEvent.click(screen.getByRole("button", { name: "2 페이지" }));

    fireEvent.change(
      screen.getByRole("combobox", { name: "공개 발견 정렬" }),
      { target: { value: "unregistered" } },
    );

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "1 페이지" })
          .getAttribute("aria-current"),
      ).toBe("page"),
    );
    expect(screen.getByText("공개된 요리 21개")).toBeTruthy();
    expect(screen.queryByText("공개 요리 22")).toBeNull();
    expect(screen.getAllByRole("article")[0].textContent).toContain(
      "공개 요리 21",
    );
  });

  it("공개 발견 요리를 모두 등록했으면 전용 빈 상태를 보여준다", () => {
    render(
      <CookingPublicDiscoveryPanel
        discoveries={discoveries.slice(0, 2).map((discovery) => ({
          ...discovery,
          codexRegistered: true,
        }))}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "공개 발견 정렬" }),
      { target: { value: "unregistered" } },
    );

    expect(
      screen.getByText("공개 발견 요리는 모두 도감에 등록했습니다."),
    ).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });
});
