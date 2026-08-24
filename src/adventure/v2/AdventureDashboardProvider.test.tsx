// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  AdventureDashboardProvider,
  useAdventureDashboard,
} from "./AdventureDashboardProvider";
import {
  DEFAULT_ADVENTURE_HOME_PREFERENCES,
  type AdventureDashboardSnapshot,
} from "./adventureDashboard";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const snapshot: AdventureDashboardSnapshot = {
  serverNow: 1,
  preferences: DEFAULT_ADVENTURE_HOME_PREFERENCES,
  activities: [],
  summary: { completed: 0, total: 0, actionableCount: 0 },
  notifications: { tabs: {}, paths: {} },
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AdventureDashboardProvider>{children}</AdventureDashboardProvider>
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdventureDashboardProvider", () => {
  it("영속 크롬에서 대시보드 스냅샷을 한 번 불러온다", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, ...snapshot })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAdventureDashboard(), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("환경설정을 낙관적으로 반영하고 저장 실패 시 되돌린다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, ...snapshot })))
      .mockResolvedValueOnce(new Response("fail", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAdventureDashboard(), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());

    await expect(
      act(() =>
        result.current.updatePreferences({ characterExpanded: true }),
      ),
    ).rejects.toThrow("preference_save_failed");

    expect(result.current.snapshot?.preferences.characterExpanded).toBe(false);
  });
});
