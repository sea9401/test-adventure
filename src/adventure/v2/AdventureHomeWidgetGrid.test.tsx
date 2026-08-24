// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdventureHomeWidgetGrid } from "./AdventureHomeWidgetGrid";

describe("모험 홈 위젯 편집", () => {
  it("저장 순서와 숨김 설정대로 표시하고 버튼으로 순서를 바꾼다", () => {
    const onOrderChange = vi.fn();
    render(
      <AdventureHomeWidgetGrid
        order={["announcements", "character_summary", "ranking_preview"]}
        hidden={["ranking_preview"]}
        editing
        onOrderChange={onOrderChange}
        onHiddenChange={vi.fn()}
        widgets={{
          character_summary: <div>캐릭터</div>,
          announcements: <div>공지</div>,
          ranking_preview: <div>랭킹</div>,
        }}
      />,
    );

    expect(screen.getAllByTestId("home-widget").map((node) => node.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("공지"), expect.stringContaining("캐릭터")]),
    );
    expect(
      screen.getAllByTestId("home-widget").some((node) => node.textContent?.includes("랭킹")),
    ).toBe(false);
    const moveUp = screen.getByRole("button", { name: "캐릭터 위로 이동" });
    expect(moveUp.className).toContain("size-11");
    const widgetGrid = screen.getAllByTestId("home-widget")[0]?.parentElement;
    expect(widgetGrid?.className).toContain("grid-cols-1");
    expect(widgetGrid?.className).toContain("sm:grid-cols-2");
    fireEvent.click(moveUp);
    expect(onOrderChange).toHaveBeenCalledWith([
      "character_summary",
      "announcements",
      "ranking_preview",
    ]);
  });
  it("공지·최근 게시글·랭킹 위젯을 데스크톱에서 같은 높이로 표시한다", () => {
    render(
      <AdventureHomeWidgetGrid
        order={["announcements", "bulletin_preview", "ranking_preview"]}
        hidden={[]}
        editing={false}
        onOrderChange={vi.fn()}
        onHiddenChange={vi.fn()}
        widgets={{
          announcements: <section>공지</section>,
          bulletin_preview: <section>최근 게시글</section>,
          ranking_preview: <section>랭킹</section>,
        }}
      />,
    );

    const contentClasses = screen
      .getAllByTestId("home-widget")
      .slice(-3)
      .map((widget) => widget.lastElementChild?.className);

    expect(contentClasses).toEqual([
      expect.stringContaining("sm:h-[21rem]"),
      expect.stringContaining("sm:h-[21rem]"),
      expect.stringContaining("sm:h-[21rem]"),
    ]);
    expect(contentClasses).toEqual([
      expect.stringContaining("[&>*]:h-full"),
      expect.stringContaining("[&>*]:h-full"),
      expect.stringContaining("[&>*]:h-full"),
    ]);
  });

  it("기본으로 숨긴 스태미나 위젯을 홈 편집에서 다시 추가한다", () => {
    const onHiddenChange = vi.fn();
    render(
      <AdventureHomeWidgetGrid
        order={["stamina"]}
        hidden={["stamina"]}
        editing
        onOrderChange={vi.fn()}
        onHiddenChange={onHiddenChange}
        widgets={{ stamina: <div>스태미나 상태</div> }}
      />,
    );

    expect(screen.queryByText("스태미나 상태")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "스태미나" }),
    );
    expect(onHiddenChange).toHaveBeenCalledWith([]);
  });
});
