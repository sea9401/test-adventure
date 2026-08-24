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
});
