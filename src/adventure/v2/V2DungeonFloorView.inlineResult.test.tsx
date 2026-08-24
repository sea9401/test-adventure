// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const result = (expGained: number) => ({
  floor: 1,
  enemyName: "슬라임",
  won: true,
  expGained,
  goldGained: 3,
  levelsGained: 0,
  turns: 1,
  hpBefore: 100,
  hpAfter: 95,
  maxHp: 100,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("던전 인라인 결과 연결", () => {
  it("결과창을 띄우지 않고 같은 화면에서 결과 확인과 다음 사냥을 이어간다", async () => {
    mocks.hunt
      .mockResolvedValueOnce(result(5))
      .mockResolvedValueOnce(result(9));

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
    fireEvent.click(huntButton);

    const firstResult = await screen.findByRole("region", {
      name: "최근 사냥 결과",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(firstResult).getByText("+5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /닫기/ })).toBeNull();

    fireEvent.click(huntButton);

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", { name: "최근 사냥 결과" }),
        ).getByText("+9"),
      ).toBeTruthy(),
    );
  });

  it("새로 발견한 레어맵 입장 동작을 인라인 결과 아래에 유지한다", async () => {
    const onEnterRareMap = vi.fn();
    const rareMap = {
      iid: "rare-map-1",
      kind: "worn_map" as const,
      depth: 1,
      runsLeft: 30,
      foundAt: Date.now(),
    };
    mocks.hunt.mockResolvedValue({
      ...result(5),
      rareMapDrop: rareMap.kind,
      rareMapDropInstance: rareMap,
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
        onEnterRareMap={onEnterRareMap}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^사냥 \(/ }));

    const enterRareMap = await screen.findByRole("button", {
      name: "레어맵 · 낡은 탐사로",
    });
    fireEvent.click(enterRareMap);
    expect(onEnterRareMap).toHaveBeenCalledWith(rareMap);
  });
});
