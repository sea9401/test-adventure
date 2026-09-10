// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2ArenaTournamentTab } from "./V2ArenaTournamentTab";

const ACTIVE_TOURNAMENT = {
  ok: true,
  phase: "tournament",
  season: {
    id: "2026-W37",
    rankedEndsAt: "2026-09-12T15:00:00.000Z",
    snapshotsAt: "2026-09-13T03:00:00.000Z",
    startsAt: "2026-09-13T04:00:00.000Z",
    endAt: "2026-09-13T15:00:00.000Z",
  },
  tournament: {
    seasonId: "2026-W37",
    isCurrent: true,
    bracket: {
      version: 2,
      seasonId: "2026-W37",
      bracketSize: 8,
      minimumMatches: 10,
      generatedAt: "2026-09-12T15:00:00.000Z",
      startsAt: "2026-09-13T04:00:00.000Z",
      status: "in_progress",
      participants: [],
      matches: [],
      championUserId: null,
      rewards: [],
    },
    myReward: null,
  },
};

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("V2ArenaTournamentTab polling", () => {
  it("진행 상태가 같으면 15초에서 30초로 늦추고 hidden 동안 멈춘다", async () => {
    const fetcher = vi.fn(async () => Response.json(ACTIVE_TOURNAMENT));
    vi.stubGlobal("fetch", fetcher);
    render(<V2ArenaTournamentTab />);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(fetcher).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(fetcher).toHaveBeenCalledTimes(4);

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(fetcher).toHaveBeenCalledTimes(4);
    act(() => setVisibility("visible"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
