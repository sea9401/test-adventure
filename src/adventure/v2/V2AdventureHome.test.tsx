// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updatePreferences: vi.fn(async () => undefined),
  refreshGameState: vi.fn(async () => undefined),
}));

vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({
    snapshot: {
      serverNow: 1,
      preferences: {
        version: 1,
        widgetOrder: ["stamina"],
        hiddenWidgetIds: [],
        characterExpanded: false,
        activityEnabled: {},
        seenUnlockedActivityIds: [],
      },
      activities: [],
      summary: { completed: 0, total: 0, actionableCount: 0 },
      notifications: { tabs: {}, paths: {} },
    },
    loading: false,
    error: null,
    refresh: vi.fn(async () => undefined),
    updatePreferences: mocks.updatePreferences,
  }),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    stamina: { current: 123, lastUpdatedAt: 1 },
    staminaMax: 2_000,
    staminaRegenBonusPct: 0,
    staminaPotions: 3,
    refreshGameState: mocks.refreshGameState,
  }),
}));

vi.mock("./StaminaBar", () => ({
  StaminaBar: () => <div>홈 스태미나 바</div>,
}));

vi.mock("./fetchGameState", () => ({
  fetchGameState: vi.fn(async () =>
    new Response(JSON.stringify({ ok: true })),
  ),
}));

vi.mock("./AdventureActivityChecklist", () => ({
  AdventureActivityChecklist: () => <div>활동</div>,
}));
vi.mock("./GuideQuestBanner", () => ({ GuideQuestBanner: () => <div>퀘스트</div> }));
vi.mock("./V2AnnouncementsPanel", () => ({ V2AnnouncementsPanel: () => <div>공지</div> }));
vi.mock("./RecentBulletinPreview", () => ({ RecentBulletinPreview: () => <div>게시글</div> }));
vi.mock("./AdventureRankingPreview", () => ({ AdventureRankingPreview: () => <div>랭킹</div> }));

import { V2AdventureHome } from "./V2AdventureHome";

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.updatePreferences.mockClear();
});

describe("V2AdventureHome 스태미나 위젯", () => {
  it("저장 설정으로 스태미나 바를 표시하고 홈 편집에서 숨긴다", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
    );

    render(<V2AdventureHome />);

    expect(screen.getByText("홈 스태미나 바")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "홈 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "스태미나 숨기기" }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      hiddenWidgetIds: ["stamina"],
    });
  });
});
