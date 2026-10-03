// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdventureHomeWidgetGrid } from "./AdventureHomeWidgetGrid";

describe("모험 홈 위젯", () => {
  it("저장 순서와 숨김 설정대로 표시한다", () => {
    render(
      <AdventureHomeWidgetGrid
        order={["announcements", "character_summary", "ranking_preview"]}
        hidden={["ranking_preview"]}
        widgets={{
          character_summary: <div>캐릭터</div>,
          announcements: <div>공지</div>,
          ranking_preview: <div>랭킹</div>,
        }}
      />,
    );

    expect(
      screen.getAllByTestId("home-widget").map((node) => node.textContent),
    ).toEqual(["공지", "캐릭터"]);
    expect(
      screen.getAllByTestId("home-widget").some((node) => node.textContent?.includes("랭킹")),
    ).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
    const widgetGrid = screen.getAllByTestId("home-widget")[0]?.parentElement;
    expect(widgetGrid?.className).toContain("grid-cols-1");
    expect(widgetGrid?.className).toContain("sm:grid-cols-2");
  });
  it("공지·최근 게시글·랭킹 위젯을 데스크톱에서 같은 높이로 표시한다", () => {
    render(
      <AdventureHomeWidgetGrid
        order={["announcements", "bulletin_preview", "ranking_preview"]}
        hidden={[]}
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

  it("내용 없이 비어 있는 위젯 칸은 자리를 차지하지 않게 숨긴다", () => {
    const Empty = () => null;
    const { container } = render(
      <AdventureHomeWidgetGrid
        order={["announcements", "bulletin_preview"]}
        hidden={[]}
        widgets={{ announcements: <Empty />, bulletin_preview: <p>글</p> }}
      />,
    );

    const cells = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="home-widget"]'),
    );
    expect(cells).toHaveLength(2);
    expect(cells.every((cell) => cell.className.includes("has-[>div:empty]:hidden"))).toBe(true);
    expect((cells[0].firstElementChild as HTMLElement).innerHTML).toBe("");
  });
});
