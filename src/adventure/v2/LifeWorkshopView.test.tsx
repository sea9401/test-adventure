import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LifeWorkshopQuantityControls } from "./LifeWorkshopView";

describe("생활 조합 작업장 수량 선택", () => {
  it("1개, 10개, 최대 빠른 제작과 직접 입력을 함께 제공한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopQuantityControls
        maxQuantity={37}
        unit="개"
        actionLabel="제작"
        inputLabel="쐐기 제작 수량"
        busy={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain(">1개</button>");
    expect(html).toContain(">10개</button>");
    expect(html).toContain("최대 37개");
    expect(html).toContain('aria-label="쐐기 제작 수량"');
    expect(html).toContain('max="37"');
    expect(html).toContain(">1개 제작</button>");
  });

  it("10회분이 없으면 10회 빠른 가공을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <LifeWorkshopQuantityControls
        maxQuantity={4}
        unit="회"
        actionLabel="가공"
        inputLabel="목재 가공 수량"
        busy={false}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>10회<\/button>/);
    expect(html).toContain("최대 4회");
    expect(html).toContain('max="4"');
  });
});
