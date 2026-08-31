import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./GameStateRefreshContext", () => ({
  useRefreshGameState: () => vi.fn(),
}));

import { V2AttendanceView } from "./V2AttendanceView";

describe("V2AttendanceView", () => {
  it("보상 종류마다 자체 SVG 아이콘을 표시한다", () => {
    const html = renderToStaticMarkup(<V2AttendanceView />);

    expect(html).toContain('data-plump-icon="mastery_token"');
    expect(html).toContain('data-plump-icon="map_fragment"');
    expect(html).toContain('data-plump-icon="currency_stack"');
    expect(html).not.toContain("🏅");
  });

  it("고정된 일차 안내 대신 실제 월별 보상표 확인을 안내한다", () => {
    const html = renderToStaticMarkup(<V2AttendanceView />);

    expect(html).toContain("각 일차의 보상과 수량은 아래 출석판");
    expect(html).not.toContain("14·21일차");
    expect(html).not.toContain("7·14·28일차");
  });
});
