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

describe("던전 자동사냥 batch", () => {
  it("기본 1회 설정에서 길게 누르면 단판 대신 5회 batch를 즉시 시작한다", async () => {
    mocks.huntBatch.mockReturnValue(new Promise(() => {}));
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

    fireEvent.pointerDown(screen.getByRole("button", { name: /^사냥 \(/ }));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(mocks.hunt).not.toHaveBeenCalled();
    expect(mocks.huntBatch).toHaveBeenCalledWith(
      1,
      5,
      expect.any(Object),
    );
  });

  it("100회가 선택돼도 5회 batch로 시작하고 7.5초 뒤 다시 사냥한다", async () => {
    localStorage.setItem("v2-hunt-count.v1", "100");
    mocks.huntBatch.mockResolvedValue({
      attempted: 5,
      completed: 5,
      wins: 5,
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

    fireEvent.pointerDown(screen.getByRole("button", { name: /사냥 \(/ }));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.huntBatch).toHaveBeenCalledTimes(1);
    expect(mocks.huntBatch).toHaveBeenLastCalledWith(
      1,
      5,
      expect.any(Object),
    );

    await act(async () => vi.advanceTimersByTimeAsync(7_500));
    expect(mocks.huntBatch).toHaveBeenCalledTimes(2);
  });
});
