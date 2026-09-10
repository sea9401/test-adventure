// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoopListState, useCoopSessionState } from "./useCoopBossState";

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

describe("coop polling", () => {
  it("변화 없는 목록은 20초에서 60초로 늦추고 hidden 동안 멈춘다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, scrolls: 1, sessions: [], claimables: [] }),
    );
    vi.stubGlobal("fetch", fetcher);
    renderHook(() => useCoopListState());
    await act(async () => vi.advanceTimersByTimeAsync(0));

    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(fetcher).toHaveBeenCalledTimes(3);

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(fetcher).toHaveBeenCalledTimes(3);
    act(() => setVisibility("visible"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("서버가 종료를 확정한 상세 세션은 추가 폴링하지 않는다", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        ok: true,
        session: { defeated: true, expired: false },
        my: {},
        combatPreview: null,
        participantCount: 0,
        top: [],
        recentAttacks: [],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    renderHook(() => useCoopSessionState({ sessionId: "done", setStamina: vi.fn() }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
