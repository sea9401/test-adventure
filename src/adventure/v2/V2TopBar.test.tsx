import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2TopBar } from "./V2TopBar";

vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <span>알림</span>,
}));

vi.mock("./V2SettingsMenu", () => ({
  V2SettingsMenu: () => <span>메뉴</span>,
}));

describe("V2TopBar", () => {
  const renderTopBar = () =>
    renderToStaticMarkup(
      <V2TopBar
        stamina={{ current: 86, lastUpdatedAt: 0 }}
        staminaMax={120}
        spendableGold={128_450}
      />,
    );

  it("승인된 목업처럼 텍스트 브랜드와 핵심 자원을 한 줄에 표시한다", () => {
    const html = renderTopBar();

    expect(html).toContain("무슨무슨게임");
    expect(html).toContain("86 / 120");
    expect(html).toContain("128,450");
    expect(html).toContain("알림");
    expect(html).toContain("메뉴");
    expect(html).not.toContain("/icon-192.png");
    expect(html).not.toContain("휴식 중");
  });

  it("결합형 헤더 안의 상단 행으로 렌더하고 모바일에서는 골드를 숨긴다", () => {
    const html = renderTopBar();

    expect(html).toContain("data-game-top-bar");
    expect(html).not.toContain("max-w-[864px]");
    expect(html).toContain("data-topbar-gold");
    expect(html).toMatch(/data-topbar-gold[^>]+class="[^"]*hidden[^"]*sm:inline-flex/);
    expect(html).toMatch(/^<div[^>]+data-game-top-bar/);
    expect(html).not.toContain("sticky top-0");
  });
});
