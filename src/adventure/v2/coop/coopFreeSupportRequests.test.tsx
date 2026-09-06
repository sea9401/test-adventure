// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoopListState, useCoopSessionState } from "./useCoopBossState";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("무료 지원 API 요청", () => {
  it("소환/지원 공격/허용 변경의 선택값을 서버로 전달한다", async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        requests.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({
        ok: true,
        sessions: [],
        claimables: [],
        scrolls: 99,
        sessionId: "boss",
        session: { defeated: false, expired: false },
        my: {},
      });
    });
    const list = renderHook(() => useCoopListState());
    await waitFor(() => expect(list.result.current.loaded).toBe(true));
    await act(async () => {
      await list.result.current.summon("mountain_chief", true);
    });
    const detail = renderHook(() =>
      useCoopSessionState({ sessionId: "boss", setStamina: () => {} }),
    );
    await waitFor(() => expect(detail.result.current.detail).not.toBeNull());
    await act(async () => {
      await detail.result.current.attack(true);
    });
    await act(async () => {
      await detail.result.current.setFreeSupport(false);
    });
    expect(requests).toEqual([
      {
        url: "/api/v2/coop/summon",
        body: { kind: "mountain_chief", allowFreeSupport: true },
      },
      {
        url: "/api/v2/coop/attack",
        body: { sessionId: "boss", support: true },
      },
      { url: "/api/v2/coop/boss/support", body: { allowFreeSupport: false } },
    ]);
  });
});
