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

import { RARE_MAP_CAP } from "@/adventure/data/v2/rareMaps";
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

describe("패배 시 정지 조건", () => {
  // 패배했지만 충전약으로 체력이 돌아와 서버가 그 묶음만 멈춘 응답.
  const defeatedBatch = {
    attempted: 5,
    completed: 2,
    wins: 1,
    losses: 1,
    totalExp: 10,
    totalProficiency: 0,
    proficiencyPointsAfter: 0,
    totalMastery: 0,
    totalGold: 10,
    totalLossTax: 0,
    finalGoldAfter: 10,
    expAfter: 10,
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
    stoppedReason: "defeat",
    replays: [],
    finalHpAfter: 100,
    finalMaxHp: 100,
    playerMaxMp: 0,
    hpCharges: 999,
    mpCharges: 0,
    finalLevelAfter: 1,
  };

  async function startAutoBatch() {
    localStorage.setItem("v2-hunt-count.v1", "5");
    mocks.huntBatch.mockResolvedValue(defeatedBatch);
    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        playerName="모험가"
        playerGender="male"
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
    fireEvent.pointerUp(huntButton);
    fireEvent.click(huntButton);
    expect(mocks.huntBatch).toHaveBeenCalledTimes(1);
    return huntButton;
  }

  it("조건을 켜면 패배한 묶음에서 자동 사냥을 멈추고 이유를 알린다", async () => {
    localStorage.setItem("v2-auto-hunt-stop.v1", JSON.stringify({ defeatEnabled: true }));
    const huntButton = await startAutoBatch();

    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(mocks.huntBatch).toHaveBeenCalledTimes(1);
    expect(huntButton.getAttribute("aria-pressed")).toBe("false");
    // 묶음 결과와 자동 사냥 종료 안내 두 곳에 이유가 나온다.
    expect(screen.getAllByText(/전투에서 패배했습니다\./).length).toBeGreaterThan(0);
  });

  it("조건을 끄면 전처럼 다음 묶음으로 넘어간다", async () => {
    const huntButton = await startAutoBatch();

    await act(async () => vi.advanceTimersByTimeAsync(1_500));

    expect(mocks.huntBatch).toHaveBeenCalledTimes(2);
    expect(huntButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("단판 자동 사냥도 조건을 켜면 패배한 전투에서 멈춘다", async () => {
    localStorage.setItem("v2-auto-hunt-stop.v1", JSON.stringify({ defeatEnabled: true }));
    mocks.hunt.mockResolvedValue({
      won: false,
      enemyName: "슬라임",
      turns: 9,
      expGained: 0,
      goldGained: 0,
      proficiencyGained: 0,
      levelsGained: 0,
      statGains: {},
      drops: {},
      droppedEquipments: [],
      droppedUniques: [],
      hpAfter: 100,
      maxHp: 100,
      hpCharges: 999,
      mpCharges: 0,
    });
    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
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
    fireEvent.pointerUp(huntButton);
    fireEvent.click(huntButton);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(mocks.hunt).toHaveBeenCalledTimes(1);
    expect(huntButton.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/전투에서 패배했습니다\./)).toBeTruthy();
  });
});

describe("자동사냥 정지 조건 설정", () => {
  it("미개척지에서도 희귀 탐사 발견·레어맵 가득 참 정지 조건을 바꿀 수 있다", () => {
    render(
      <V2DungeonFloorView
        floorId={105}
        huntMode="unexplored"
        unexploredSummary={{
          difficulty: 105,
          encounterShares: [{ kind: "base", share: 100 }],
          rewardPct: {
            gold: 0,
            baseMaterial: 0,
            equipment: 0,
            quality: 0,
            specialMaterial: 0,
            rare: 0,
          },
          rareCopyChancePct: 0,
          traceEnabled: false,
          traceExtraChancePct: 0,
        }}
        outpostId="start"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 100, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전투 설정" }));

    expect(
      screen.getByRole("checkbox", { name: "희귀 탐사맵 발견 시" }),
    ).toBeTruthy();
    const fullStop = screen.getByRole("checkbox", {
      name: `레어맵 ${RARE_MAP_CAP}장 보유 시`,
    });
    expect((fullStop as HTMLInputElement).checked).toBe(false);
    fireEvent.click(fullStop);
    expect((fullStop as HTMLInputElement).checked).toBe(true);
  });
});
