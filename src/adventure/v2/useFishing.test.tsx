// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFishing } from "./useFishing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFishing", () => {
  it("진입 시 challenges overview 한 번으로 낚시 표시 상태를 초기화한다", async () => {
    const progression = { level: 7, xp: 120 };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/v2/fishing/challenges");
      return Response.json({
        ok: true,
        challenges: [],
        contracts: [],
        goals: [],
        progression,
        dailyCatchCoins: { earned: 12, cap: 3_000 },
        dailyCatchItems: [
          { itemId: "catch_common", name: "일반 어획물", awarded: 3, cap: 50 },
        ],
        activeAutoActivity: "mining",
      });
    });
    vi.stubGlobal("fetch", fetcher);

    const hook = renderHook(() => useFishing("village_pier"));

    await waitFor(() => expect(hook.result.current.progressionLoading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(hook.result.current.progression).toEqual(progression);
    expect(hook.result.current.dailyCatchCoins).toEqual({ earned: 12, cap: 3_000 });
    expect(hook.result.current.dailyCatchItems).toEqual([
      { itemId: "catch_common", name: "일반 어획물", awarded: 3, cap: 50 },
    ]);
    expect(hook.result.current.activeAutoActivity).toBe("mining");
  });
});
