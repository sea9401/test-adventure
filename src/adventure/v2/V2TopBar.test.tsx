// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2TopBar } from "./V2TopBar";
import type { AutoGatheringStatus } from "./autoGathering";

vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <span>알림</span>,
}));

vi.mock("./V2SettingsMenu", () => ({
  V2SettingsMenu: () => <span>메뉴</span>,
}));

describe("V2TopBar", () => {
  const renderTopBar = ({
    autoGathering = null,
    fishingActive = false,
  }: {
    autoGathering?: AutoGatheringStatus | null;
    fishingActive?: boolean;
  } = {}) =>
    renderToStaticMarkup(
      <V2TopBar
        stamina={{ current: 86, lastUpdatedAt: Date.now() }}
        staminaMax={120}
        staminaRegenBonusPct={0}
        staminaPotions={3}
        onUsePotion={vi.fn()}
        spendableGold={128_450}
        autoGathering={autoGathering}
        fishingActive={fishingActive}
      />,
    );

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("파비콘과 자동 생활 남은 시간을 핵심 자원과 한 줄에 표시한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00Z"));
    const html = renderTopBar({
      autoGathering: {
        activity: "woodcutting",
        sourceId: "oak",
        sourceName: "참나무 숲",
        readyAt: Date.now() + 65_000,
      },
    });
    vi.useRealTimers();

    expect(html).toContain('/icon-192.png');
    expect(html).not.toContain(">무슨무슨게임<");
    expect(html).toContain("벌목 자동 중 · 참나무 숲");
    expect(html).toContain("남은 1:05");
    expect(html).toContain("86 / 120");
    expect(html).toContain("128,450");
    expect(html).toContain("알림");
    expect(html).toContain("메뉴");
  });

  it("자동 생활이 없으면 아이콘 옆에 휴식 상태를 표시한다", () => {
    expect(renderTopBar()).toContain("휴식 중");
  });

  it("결합형 헤더 안의 상단 행으로 렌더하고 모바일에서는 골드를 숨긴다", () => {
    const html = renderTopBar();

    expect(html).toContain("data-game-top-bar");
    expect(html).not.toContain("max-w-[864px]");
    expect(html).toContain("min-w-0 flex-1");
    expect(html).toContain("max-w-[142px]");
    expect(html).toContain("data-topbar-gold");
    expect(html).toMatch(/data-topbar-gold[^>]+class="[^"]*hidden[^"]*sm:inline-flex/);
    expect(html).toMatch(/^<div[^>]+data-game-top-bar/);
    expect(html).not.toContain("sticky top-0");
  });

  it("저장 기준값 이후의 자동 회복을 1초마다 헤더 숫자에 반영한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00Z"));
    const lastUpdatedAt = Date.now();

    render(
      <V2TopBar
        stamina={{ current: 86, lastUpdatedAt }}
        staminaMax={120}
        staminaRegenBonusPct={0}
        staminaPotions={3}
        onUsePotion={vi.fn()}
        spendableGold={128_450}
        autoGathering={null}
        fishingActive={false}
      />,
    );

    expect(screen.getByLabelText("스태미나 86 / 120")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(screen.getByLabelText("스태미나 87 / 120")).toBeTruthy();
  });

  it("헤더 스태미나를 누르면 기존 포션 사용 기능을 연다", () => {
    render(
      <V2TopBar
        stamina={{ current: 86, lastUpdatedAt: Date.now() }}
        staminaMax={120}
        staminaRegenBonusPct={0}
        staminaPotions={3}
        onUsePotion={vi.fn()}
        spendableGold={128_450}
        autoGathering={null}
        fishingActive={false}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "스태미나 86 / 120" }),
    );

    expect(
      screen.getByRole("heading", { name: "스태미나 포션 사용" }),
    ).toBeTruthy();
  });
});
