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
  it("홈 아이콘과 휴식 상태를 분리하고 아이콘을 32px로 표시한다", () => {
    const html = renderToStaticMarkup(<V2TopBar autoGathering={null} />);

    expect(html).toContain('href="/"');
    expect(html).toContain('aria-label="무슨무슨게임 홈으로 이동"');
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain("휴식 중");
    expect(html).not.toContain('href="/town/logging"');
    expect(html).not.toContain('href="/town/mining"');
  });

  it("자동 벌목 상태를 벌목 화면 링크로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar
        autoGathering={{
          activity: "woodcutting",
          sourceName: "초보자의 숲",
          readyAt: Date.now() + 60_000,
        }}
      />,
    );

    expect(html).toContain('href="/town/logging"');
    expect(html).toContain('aria-label="벌목 화면으로 이동"');
  });

  it("자동 채광 상태를 채광 화면 링크로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar
        autoGathering={{
          activity: "mining",
          sourceName: "바위산 채석장",
          readyAt: Date.now() + 60_000,
        }}
      />,
    );

    expect(html).toContain('href="/town/mining"');
    expect(html).toContain('aria-label="채광 화면으로 이동"');
  });
});
