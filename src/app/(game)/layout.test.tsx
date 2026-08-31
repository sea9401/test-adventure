import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/v2/GameClientBoundary", () => ({
  GameClientBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import GameLayout from "./layout";

describe("게임 레이아웃 전투 로그 슬롯", () => {
  it("로그로 이동해도 기존 결과 화면을 함께 유지한다", () => {
    const props = {
      children: <div>기존 전투 결과</div>,
      battleLog: <div>전투 로그 전용 화면</div>,
    };

    const html = renderToStaticMarkup(GameLayout(props));

    expect(html).toContain("기존 전투 결과");
    expect(html).toContain("전투 로그 전용 화면");
  });
});
