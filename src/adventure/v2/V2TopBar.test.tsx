import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2TopBar } from "./V2TopBar";

vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <span>알림</span>,
}));

vi.mock("./V2NoticeLink", () => ({
  V2NoticeLink: () => <a href="/plaza/notices">공지사항</a>,
}));

vi.mock("./V2SettingsMenu", () => ({
  V2SettingsMenu: () => <span>메뉴</span>,
}));

describe("V2TopBar", () => {
  it("프로스티드 공용 헤더와 44px 홈 조작 영역을 사용한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar autoGathering={null} fishingActive={false} />,
    );

    expect(html).toContain("backdrop-blur");
    expect(html).toContain("data-game-top-bar");
    expect(html).toContain("size-11");
  });

  it("화면 상단 안전 영역 아래에 게임 조작부를 배치한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar autoGathering={null} fishingActive={false} />,
    );

    expect(html).toContain(
      "pt-[max(0.75rem,env(safe-area-inset-top))]",
    );
  });

  it("홈 아이콘과 휴식 상태를 분리하고 아이콘을 32px로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar autoGathering={null} fishingActive={false} />,
    );

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/plaza/notices"');
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
          sourceId: "birch",
          sourceName: "자작나무",
          readyAt: Date.now() + 60_000,
        }}
        fishingActive={false}
      />,
    );

    expect(html).toContain('href="/town/logging?spot=birch_grove"');
    expect(html).toContain('aria-label="벌목 화면으로 이동"');
  });

  it("자동 채광 상태를 채광 화면 링크로 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar
        autoGathering={{
          activity: "mining",
          sourceId: "silver",
          sourceName: "은 광맥",
          readyAt: Date.now() + 60_000,
        }}
        fishingActive={false}
      />,
    );

    expect(html).toContain('href="/town/mining?spot=silver_cavern"');
    expect(html).toContain('aria-label="채광 화면으로 이동"');
  });

  it("긴 작업 장소명은 줄이고 남은 시간은 별도 고정 영역에 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar
        autoGathering={{
          activity: "woodcutting",
          sourceId: "birch",
          sourceName: "아주 길어서 좁은 화면을 가득 채우는 자작나무 숲",
          readyAt: Date.now() + 2 * 60 * 60 * 1_000,
        }}
        fishingActive={false}
      />,
    );

    expect(html).toContain("아주 길어서 좁은 화면을 가득 채우는 자작나무 숲");
    expect(html).toContain("data-auto-gathering-status-detail");
    expect(html).toContain("shrink-0 whitespace-nowrap");
    expect(html).toContain("남은 2:00:00");
  });

  it("낚시 진행 중에는 낚시 화면 링크를 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar autoGathering={null} fishingActive />,
    );

    expect(html).toContain("낚시 중");
    expect(html).toContain('href="/town/fishing"');
    expect(html).toContain('aria-label="낚시 화면으로 이동"');
    expect(html).not.toContain("휴식 중");
  });

  it("자동 채집과 낚시가 겹치면 자동 채집을 우선 표시한다", () => {
    const html = renderToStaticMarkup(
      <V2TopBar
        autoGathering={{
          activity: "woodcutting",
          sourceId: "birch",
          sourceName: "자작나무",
          readyAt: Date.now() + 60_000,
        }}
        fishingActive
      />,
    );

    expect(html).toContain('href="/town/logging?spot=birch_grove"');
    expect(html).not.toContain('href="/town/fishing"');
  });
});
