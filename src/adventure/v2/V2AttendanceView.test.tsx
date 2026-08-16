import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./GameStateRefreshContext", () => ({
  useRefreshGameState: () => vi.fn(),
}));

import { V2AttendanceView } from "./V2AttendanceView";

describe("V2AttendanceView", () => {
  it("지도 조각과 협동 주화를 서로 다른 보상 아이콘으로 표시한다", () => {
    const html = renderToStaticMarkup(<V2AttendanceView />);

    expect(html).toContain("🗺️");
    expect(html).toContain("🪙");
  });

  it("14·21일차 월간 모험 지원권 7일을 상단에서 안내한다", () => {
    const html = renderToStaticMarkup(<V2AttendanceView />);

    expect(html).toContain("14·21일차");
    expect(html).toContain("지원권 7일");
  });
});
