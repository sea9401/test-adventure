// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hunt: vi.fn(),
  huntBatch: vi.fn(),
}));

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({ state: { flags: [] }, set: vi.fn() }),
}));
vi.mock("@/adventure/v2/useDungeonHunt", () => ({
  useDungeonHunt: () => ({
    busy: false,
    lastResult: null,
    hunt: mocks.hunt,
    huntBatch: mocks.huntBatch,
  }),
}));

import { V2DungeonFloorView } from "./V2DungeonFloorView";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mocks.hunt.mockReset();
  mocks.hunt.mockResolvedValue(null);
  mocks.huntBatch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("던전 자동사냥 연속 실행", () => {
  it("첫 단판이 진행 중이어도 길게 누른 손을 떼면 자동사냥을 유지한다", async () => {
    mocks.hunt.mockReturnValue(new Promise(() => {}));
    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        outpostName="초원 거점"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 100, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const huntButton = screen.getByRole("button", { name: /^사냥 \(/ });
    fireEvent.pointerDown(huntButton);
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(mocks.hunt).toHaveBeenCalledWith(1, expect.any(Object));
    expect(mocks.huntBatch).not.toHaveBeenCalled();

    fireEvent.pointerUp(huntButton);
    fireEvent.click(huntButton);

    expect(huntButton.getAttribute("aria-pressed")).toBe("true");
  });

  it.each([5, 10, 50, 100])("선택한 %i회 일괄 사냥을 1.5초 간격으로 반복한다", async (count) => {
    localStorage.setItem("v2-hunt-count.v1", String(count));
    mocks.huntBatch.mockResolvedValue({
      attempted: count,
      completed: count,
      wins: count,
      losses: 0,
      totalExp: 50,
      totalProficiency: 0,
      proficiencyPointsAfter: 0,
      totalMastery: 0,
      totalGold: 50,
      totalLossTax: 0,
      finalGoldAfter: 50,
      expAfter: 50,
      maxExpAfter: 100,
      levelsGained: 0,
      statGains: {},
      hpGained: 0,
      mpGained: 0,
      drops: {},
      droppedEquipments: [],
      droppedUniques: [],
      rareMapDrops: [],
      rareMapDropInstances: [],
      stoppedReason: null,
      replays: [],
      finalHpAfter: 100,
      finalMaxHp: 100,
      playerMaxMp: 0,
      hpCharges: 999,
      mpCharges: 0,
      finalLevelAfter: 1,
    });
    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        outpostName="초원 거점"
        playerName="모험가"
        playerGender="male"
        adventureSupportTier="premium"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 100, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const huntButton = screen.getByRole("button", { name: /사냥 \(/ });
    fireEvent.pointerDown(huntButton);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.huntBatch).toHaveBeenCalledTimes(1);
    expect(mocks.huntBatch).toHaveBeenLastCalledWith(1, count, expect.any(Object));
    expect(mocks.hunt).not.toHaveBeenCalled();

    fireEvent.pointerUp(huntButton);
    fireEvent.click(huntButton);

    await act(async () => vi.advanceTimersByTimeAsync(1_499));
    expect(mocks.huntBatch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.huntBatch).toHaveBeenCalledTimes(2);
    expect(mocks.huntBatch).toHaveBeenLastCalledWith(1, count, expect.any(Object));
  });
});
