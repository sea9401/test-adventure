// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2DungeonFloorView } from "./V2DungeonFloorView";

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({
    state: { flags: [] },
    set: vi.fn(),
  }),
}));

vi.mock("./autoHuntStopConditions", async (importActual) => {
  const actual =
    await importActual<typeof import("./autoHuntStopConditions")>();
  return {
    ...actual,
    useAutoHuntStopConfig: () => ({
      config: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG,
      configRef: { current: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG },
      updateConfig: vi.fn(),
    }),
  };
});

const fetchMock = vi.fn();

function response(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("희귀 탐사 지도 전환", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("이전 지도가 만료된 뒤 새로 발견한 유적 탐사 상태를 표시한다", async () => {
    const now = Date.now();
    fetchMock
      .mockResolvedValueOnce(
        response({ ok: true, rareMaps: [], serverNow: now }),
      )
      .mockResolvedValueOnce(
        response({
          ok: true,
          rareMaps: [
            {
              iid: "new-relic-map",
              kind: "relic_map",
              depth: 10,
              runsLeft: 10,
              foundAt: now,
            },
          ],
          serverNow: now,
        }),
      );

    const props = {
      floorId: 10,
      outpostId: "outpost-1",
      outpostName: "마른 협곡 거점",
      playerName: "모험가",
      playerGender: "male" as const,
      stamina: { current: 100, lastUpdatedAt: 0 },
      setStamina: vi.fn(),
      onBack: vi.fn(),
      onReturnToNormalHunt: vi.fn(),
    };

    const { rerender } = render(
      <V2DungeonFloorView {...props} rareMapIid="expired-map" />,
    );

    await screen.findByText("희귀 탐사 시간이 만료되어 일반 사냥터로 이동합니다.");

    rerender(
      <V2DungeonFloorView {...props} rareMapIid="new-relic-map" />,
    );

    await waitFor(() => {
      expect(screen.getByText(/희귀 탐사 진행 중 · 1회 전투/)).toBeDefined();
    });
    expect(
      screen.queryByText("희귀 탐사 시간이 만료되어 일반 사냥터로 이동합니다."),
    ).toBeNull();
  });

  it("일반 사냥 버튼 바로 아래 같은 왼쪽 열에 열린 희귀 탐사 빠른 입장을 표시한다", async () => {
    const now = Date.now();
    fetchMock.mockResolvedValueOnce(
      response({
        ok: true,
        rareMaps: [
          {
            iid: "quick-map",
            kind: "worn_map",
            depth: 10,
            runsLeft: 30,
            foundAt: now,
          },
        ],
        serverNow: now,
      }),
    );

    render(
      <V2DungeonFloorView
        floorId={10}
        outpostId="outpost-1"
        outpostName="마른 협곡 거점"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: 0 }}
        setStamina={vi.fn()}
        onBack={vi.fn()}
        onEnterRareMap={vi.fn()}
      />,
    );

    const huntButton = screen.getByRole("button", { name: /사냥/ });
    const rareMapButton = await screen.findByRole("button", {
      name: "희귀 탐사 · 낡은 탐사로",
    });
    expect(
      huntButton.compareDocumentPosition(rareMapButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const actionGrid = huntButton.closest("[data-hunt-primary-actions]");
    expect(actionGrid).not.toBeNull();
    expect(rareMapButton.closest("[data-hunt-primary-actions]")).toBe(actionGrid);
    expect(actionGrid?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(
      rareMapButton.closest("[data-rare-map-quick-entry]")?.className,
    ).toContain("col-start-1");
  });
});
