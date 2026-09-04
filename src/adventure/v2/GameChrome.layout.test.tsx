// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameChrome } from "./GameChrome";
import { LoadoutStatResponsiveLayout } from "./LoadoutStatSummary";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    stamina: { current: 86, lastUpdatedAt: 0 },
    staminaMax: 120,
    spendableGold: 128_450,
    staminaRegenBonusPct: 0,
    staminaPotions: 0,
    viewerName: "도희",
    viewerGuildId: null,
    gameStateLoaded: true,
    coreLoopOn: true,
    huntStaminaMode: false,
    refreshGameState: vi.fn(),
  }),
}));

vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({ snapshot: null }),
}));

vi.mock("./NotificationBell", () => ({
  NotificationBell: () => <span>알림</span>,
}));

vi.mock("./V2SettingsMenu", () => ({
  V2SettingsMenu: () => <span>메뉴</span>,
}));

vi.mock("@/components/ChatButton", () => ({ ChatButton: () => null }));
vi.mock("./OfflineSettleCard", () => ({ OfflineSettleCard: () => null }));
vi.mock("@/components/safety/UgcConsentPrompt", () => ({
  UgcConsentPrompt: () => null,
}));
vi.mock("./GameSceneBackground", () => ({
  GameSceneBackground: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GameChrome 결합형 게임 헤더", () => {
  it("키보드 사용자가 반복 메뉴를 건너뛰고 현재 본문으로 이동할 수 있다", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <GameChrome>
        <main>게임 콘텐츠</main>
      </GameChrome>,
    );

    const skipLink = within(container).getByRole("link", {
      name: "본문으로 바로가기",
    });
    expect(skipLink.getAttribute("href")).toBe("#game-main-content");
    expect(skipLink.className).toContain("focus:not-sr-only");

    const target = container.querySelector("#game-main-content");
    expect(target?.getAttribute("tabindex")).toBe("-1");
    expect(target?.querySelectorAll("main")).toHaveLength(1);
  });

  it("헤더 표면과 내부 콘텐츠가 화면 상단과 좌우를 모두 채운다", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <GameChrome>
        <main>게임 콘텐츠</main>
      </GameChrome>,
    );

    const gameHeader = container.querySelector<HTMLElement>(
      "header[data-game-header]",
    );
    expect(gameHeader).not.toBeNull();
    expect(gameHeader?.className).toContain("sticky");
    expect(gameHeader?.className).toContain("bg-white");
    expect(gameHeader?.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(gameHeader?.className).not.toContain("px-3");
    expect(gameHeader?.className).not.toContain("sm:px-6");
    expect(gameHeader?.className).not.toContain("rounded-xl");
    expect(gameHeader?.firstElementChild?.className).not.toContain("max-w-");
    expect(gameHeader?.firstElementChild?.className).toContain("md:grid");
    expect(gameHeader?.firstElementChild?.className).toContain(
      "md:grid-cols-[minmax(0,1fr)_auto_auto]",
    );
    expect(gameHeader?.firstElementChild?.className).toContain("md:min-h-16");
    expect(gameHeader?.firstElementChild?.className).not.toContain(
      "md:border-b",
    );
    expect(gameHeader?.querySelector("[data-game-top-bar]")).not.toBeNull();
    expect(
      within(gameHeader as HTMLElement).getByRole("navigation", {
        name: "메인 메뉴",
      }),
    ).toBeTruthy();
    const tickerSlot = gameHeader?.querySelector<HTMLElement>(
      "[data-game-ticker-slot]",
    );
    expect(tickerSlot).not.toBeNull();
    expect(tickerSlot?.className).toContain("md:border-t");
    expect(tickerSlot?.className).toContain("md:border-zinc-200");
    expect(tickerSlot?.className).toContain("dark:md:border-zinc-800");
    expect(container.querySelectorAll("header")).toHaveLength(1);
  });

  it("동적으로 늘어난 공지 헤더 아래에 데스크톱 고정 패널을 배치한다", async () => {
    class ImmediateResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        Object.defineProperty(target, "getBoundingClientRect", {
          configurable: true,
          value: () => ({ height: 92 }) as DOMRect,
        });
        this.callback([], this as unknown as ResizeObserver);
      }

      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);

    const { container } = render(
      <GameChrome>
        <LoadoutStatResponsiveLayout current={{ power: 8_783 }} delta={null}>
          <div>스킬 목록</div>
        </LoadoutStatResponsiveLayout>
      </GameChrome>,
    );

    const chrome = container.querySelector<HTMLElement>("[data-game-chrome]");
    const desktopPanel = container.querySelector<HTMLElement>("aside");
    await waitFor(() =>
      expect(chrome?.style.getPropertyValue("--game-header-height")).toBe(
        "92px",
      ),
    );
    expect(desktopPanel?.className).toContain(
      "top-[calc(var(--game-header-height,4rem)+0.75rem)]",
    );
  });
});
