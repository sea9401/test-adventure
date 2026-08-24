// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("던전 결과 시트 연결", () => {
  it("수동 단일 사냥이 끝나면 스크롤 아래가 아니라 결과 dialog를 연다", async () => {
    mocks.hunt.mockResolvedValue({
      floor: 1,
      enemyName: "슬라임",
      won: true,
      expGained: 5,
      goldGained: 3,
      levelsGained: 0,
      turns: 1,
      hpBefore: 100,
      hpAfter: 95,
      maxHp: 100,
    });
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
    fireEvent.click(screen.getByRole("button", { name: /^사냥 \(/ }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "사냥 승리" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByRole("button", { name: "최근 결과 다시 보기" })).toBeTruthy();
  });
});
