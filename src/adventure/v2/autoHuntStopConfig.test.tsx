// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoHuntStopConfig } from "./autoHuntStopConditions";

const STORAGE_KEY = "v2-auto-hunt-stop.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("자동사냥 물약 설정 계정 동기화", () => {
  it("계정에 저장된 설정을 우선 적용하고 현재 기기에도 보관한다", async () => {
    const serverConfig = {
      hpPotionTargetPct: 45,
      mpPotionTargetPct: 35,
      potionEnabled: true,
      potionThreshold: 80,
      rareMapEnabled: false,
      level100Enabled: true,
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...serverConfig, hpPotionTargetPct: 10 }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, config: serverConfig }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { result } = renderHook(() => useAutoHuntStopConfig());

    await waitFor(() => {
      expect(result.current.config).toEqual(serverConfig);
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual(
      serverConfig,
    );
  });

  it("계정 설정이 없으면 기존 기기 값을 최초 한 번 서버로 이전한다", async () => {
    const localConfig = {
      hpPotionTargetPct: 70,
      mpPotionTargetPct: 40,
      potionEnabled: true,
      potionThreshold: 120,
      rareMapEnabled: true,
      level100Enabled: false,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localConfig));
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response(JSON.stringify({ ok: true, config: localConfig }))
        : new Response(JSON.stringify({ ok: true, config: null })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAutoHuntStopConfig());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v2/me/auto-hunt-settings",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    expect(result.current.config).toEqual(localConfig);

    act(() => {
      result.current.updateConfig({ hpPotionTargetPct: 60 });
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/v2/me/auto-hunt-settings",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"hpPotionTargetPct":60'),
        }),
      );
    });
  });
});
