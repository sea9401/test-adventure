// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hunt: vi.fn(), huntBatch: vi.fn() }));

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({ state: { flags: [] }, set: vi.fn() }),
}));
vi.mock("@/adventure/v2/useDungeonHunt", () => ({
  useDungeonHunt: () => ({ busy: false, lastResult: null, ...mocks }),
}));

import { V2DungeonFloorView } from "./V2DungeonFloorView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("희귀 탐사 전투 후 자동 복귀", () => {
  it.each([
    { label: "지도를 소진하면 복귀한다", rare: true, runsLeft: 0, returns: 1 },
    { label: "횟수가 남으면 복귀하지 않는다", rare: true, runsLeft: 10, returns: 0 },
    { label: "소진 정보가 없으면 복귀하지 않는다", rare: true, runsLeft: undefined, returns: 0 },
    { label: "일반 사냥에서는 복귀하지 않는다", rare: false, runsLeft: 0, returns: 0 },
  ])("$label", async ({ rare, runsLeft, returns }) => {
    const now = Date.now();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      serverNow: now,
      rareMaps: [{ iid: "rare-map", kind: "worn_map", depth: 1, runsLeft: 30, foundAt: now }],
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.hunt.mockResolvedValue({
      floor: 1, enemyName: "슬라임", won: true, expGained: 5, goldGained: 3,
      levelsGained: 0, turns: 1, hpBefore: 100, hpAfter: 95, maxHp: 100,
      rareMapRunsLeft: runsLeft,
    });
    const onReturnToNormalHunt = vi.fn();
    const setHp = vi.fn();
    render(<V2DungeonFloorView
      floorId={1} outpostId="start" outpostName="초원 거점"
      playerName="모험가" playerGender="male"
      stamina={{ current: 100, lastUpdatedAt: now }} setStamina={vi.fn()}
      hp={{ hp: 100, maxHp: 100, anchorMs: now }} setHp={setHp}
      onBack={vi.fn()} rareMapIid={rare ? "rare-map" : undefined}
      onReturnToNormalHunt={onReturnToNormalHunt}
    />);
    if (rare) await screen.findByText(/희귀 탐사 진행 중 · 1회 전투/);
    expect(onReturnToNormalHunt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: rare ? "희귀 탐사 시작" : /^사냥 \(/ }));

    await waitFor(() => expect(setHp).toHaveBeenCalled());
    expect(mocks.hunt).toHaveBeenCalledTimes(1);
    expect(onReturnToNormalHunt).toHaveBeenCalledTimes(returns);
    // 전투 후 목록을 다시 조회하지 않아도 서버의 소진 응답만으로 복귀한다.
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v2/me/rare-maps")).toHaveLength(rare ? 1 : 0);
  });
});
