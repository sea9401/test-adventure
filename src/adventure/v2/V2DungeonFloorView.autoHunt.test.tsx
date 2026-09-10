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
});
