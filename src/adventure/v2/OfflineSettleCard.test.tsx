// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settle: vi.fn(),
  setOfflinePending: vi.fn(),
  refreshGameState: vi.fn(),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    offlinePending: 3,
    setOfflinePending: mocks.setOfflinePending,
    refreshGameState: mocks.refreshGameState,
  }),
}));

vi.mock("./offlineSettleApi", async (importActual) => ({
  ...(await importActual<typeof import("./offlineSettleApi")>()),
  settleOfflineHuntBatches: mocks.settle,
}));

import { OfflineSettleCard } from "./OfflineSettleCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OfflineSettleCard", () => {
  it("앱 복귀 정산 모달에 정산 결과를 표시한다", async () => {
    mocks.settle.mockResolvedValue({
      battles: 3,
      wins: 3,
      losses: 0,
      totalExp: 30,
      totalProficiency: 0,
      totalMastery: 0,
      totalGold: 12,
      totalLossTax: 0,
      levelsGained: 0,
      spMilestonesGained: 0,
      depth: 79,
      remainingBattles: 0,
      stoppedReason: null,
    });

    render(<OfflineSettleCard />);

    await screen.findByRole("dialog");
    expect(screen.getByText("경험치")).toBeTruthy();
    expect(screen.getByText("승/패")).toBeTruthy();
  });
});
