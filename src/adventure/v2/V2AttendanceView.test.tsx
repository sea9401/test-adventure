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

  it("2026년 11월 출석판은 마법부여서·문장 상자를 표시하고 지원권 안내를 뺀다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T03:00:00Z"));
    try {
      const html = renderToStaticMarkup(<V2AttendanceView />);

      expect(html).toContain('data-plump-icon="enchant_scroll"');
      expect(html).toContain('data-plump-icon="emblem_box"');
      expect(html).not.toContain('data-plump-icon="adventure_support_ticket"');
      expect(html).not.toContain("월간 모험 지원권은 수령 즉시 적용");
      expect(html).toContain("마법부여서는 대장간 마법부여 작업대");
    } finally {
      vi.useRealTimers();
    }
  });

  it("2026년 10월 출석판은 기존 지원권 안내를 유지한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T03:00:00Z"));
    try {
      const html = renderToStaticMarkup(<V2AttendanceView />);

      expect(html).toContain('data-plump-icon="adventure_support_ticket"');
      expect(html).toContain("월간 모험 지원권은 수령 즉시 적용");
      expect(html).not.toContain("마법부여서는 대장간 마법부여 작업대");
    } finally {
      vi.useRealTimers();
    }
  });
});

