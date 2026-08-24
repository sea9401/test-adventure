// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameChrome } from "./GameChrome";

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

describe("GameChrome 결합형 게임 헤더", () => {
  it("상단 행과 메인 탭, 티커 슬롯을 하나의 sticky 헤더 안에 둔다", () => {
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
    expect(gameHeader?.className).toContain(
      "pt-[max(0.5rem,env(safe-area-inset-top))]",
    );
    expect(gameHeader?.querySelector("[data-game-top-bar]")).not.toBeNull();
    expect(
      within(gameHeader as HTMLElement).getByRole("navigation", {
        name: "메인 메뉴",
      }),
    ).toBeTruthy();
    expect(
      gameHeader?.querySelector("[data-game-ticker-slot]"),
    ).not.toBeNull();
    expect(container.querySelectorAll("header")).toHaveLength(1);
  });
});
