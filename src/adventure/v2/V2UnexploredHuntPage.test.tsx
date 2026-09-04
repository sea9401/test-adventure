import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UnexploredAccessPanel } from "./V2UnexploredHuntPage";

describe("미개척지 직접 진입 안내", () => {
  it("재전직 후 100레벨 미만이면 성장 조건을 안내한다", () => {
    const html = renderToStaticMarkup(
      <UnexploredAccessPanel
        kind="level"
        level={83}
        onBack={vi.fn()}
        onOpenNetwork={vi.fn()}
      />,
    );

    expect(html).toContain("현재 레벨 83");
    expect(html).toContain("100레벨 달성 후 다시 입장");
    expect(html).toContain("사냥터 목록으로");
    expect(html).toContain("bg-white");
  });

  it("중앙 노드 전에는 탐사망에서 탐사를 시작하도록 안내한다", () => {
    const html = renderToStaticMarkup(
      <UnexploredAccessPanel
        kind="start"
        level={100}
        onBack={vi.fn()}
        onOpenNetwork={vi.fn()}
      />,
    );

    expect(html).toContain("탐사 시작 노드가 필요합니다");
    expect(html).toContain("미개척지 탐사망 열기");
  });
});
