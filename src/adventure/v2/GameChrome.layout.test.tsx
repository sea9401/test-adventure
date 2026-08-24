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
