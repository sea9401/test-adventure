import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurplusExchangePanel } from "./SurplusExchangePanel";

describe("SurplusExchangePanel", () => {
  it("옥수수 105개는 20개 단건과 100개 최대 교환을 별도 버튼으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SurplusExchangePanel
        farmItems={{ corn: 105 }}
        surplusTrades={0}
        busy={null}
        onExchange={() => undefined}
      />,
    );

    expect(html).toContain("1회 · 20개");
    expect(html).toContain("최대 5회 · 100개");
    expect(html).not.toContain(">5회 교환<");
  });

  it("남은 교환 횟수가 1회면 최대 교환 버튼을 표시하지 않는다", () => {
    const html = renderToStaticMarkup(
      <SurplusExchangePanel
        farmItems={{ corn: 105 }}
        surplusTrades={4}
        busy={null}
        onExchange={() => undefined}
      />,
    );

    expect(html).toContain("오늘 남은 횟수 1회");
    expect(html).toContain("1회 · 20개");
    expect(html).not.toContain("최대 5회 · 100개");
  });
});
