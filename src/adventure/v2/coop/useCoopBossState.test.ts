// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCoopListState } from "./useCoopBossState";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useCoopListState 개인 보스 보상", () => {
  it("기여도 티어가 없는 개인 보상 응답을 그대로 보존한다", async () => {
    const personalReward = {
      rewardMode: "unexplored_personal" as const,
      bossCore: 1 as const,
      bossCoreMaterialId: "v2_unexplored_boss_core",
      poolMaterialId: "v2_unexplored_runaway_machine_part",
      poolMaterialCount: 1 as const,
      uniqueIds: ["v2_unexplored_tracking_blade_dagger"],
      uniqueNames: ["추적 절단 단검"],
      titleId: "v2_unexplored_tracking_weapon",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/v2/coop/claim" && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true, reward: personalReward }));
        }
        return new Response(
          JSON.stringify({ ok: true, scrolls: 0, sessions: [], claimables: [] }),
        );
      }),
    );

    const { result } = renderHook(() => useCoopListState());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.claim("personal-session");
    });

    expect(result.current.lastReward).toEqual(personalReward);
  });
});
