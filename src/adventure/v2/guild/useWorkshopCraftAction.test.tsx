// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkshopState } from "./guildWorkshopPanelModel";
import { useWorkshopCraftAction } from "./useWorkshopCraftAction";

afterEach(() => {
  vi.unstubAllGlobals();
});

const state = {
  recipes: [
    {
      id: "tier2_weapon",
      itemName: "시험 대검",
      slot: "weapon",
      tier: 4,
      craftOnly: true,
      artisanXp: 10,
    },
  ],
} as unknown as WorkshopState;

function okCraft(level: number) {
  return Response.json({
    ok: true,
    iid: `iid-${Math.random()}`,
    craftQuality: level > 0 ? { level } : null,
    artisanXpGained: 10,
  });
}

function setup() {
  const onMessage = vi.fn();
  const onServerSync = vi.fn();
  const onAfterCraft = vi.fn();
  const hook = renderHook(() =>
    useWorkshopCraftAction({
      state,
      endpoint: "/api/v2/guild/workshop",
      onMessage,
      onServerSync,
      onAfterCraft,
    }),
  );
  return { hook, onMessage, onServerSync, onAfterCraft };
}

describe("연속 제작 (#840)", () => {
  it("지정한 횟수만큼 차례로 제작하고 결과 창 대신 합계를 알린다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okCraft(0))
      .mockResolvedValueOnce(okCraft(1))
      .mockResolvedValueOnce(okCraft(0));
    vi.stubGlobal("fetch", fetchMock);
    const { hook, onMessage, onServerSync, onAfterCraft } = setup();

    await act(async () => {
      await hook.result.current.craft("tier2_weapon" as never, "normal", false, 3);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onServerSync).toHaveBeenCalledTimes(3);
    expect(onAfterCraft).toHaveBeenCalledTimes(1);
    expect(hook.result.current.craftResult).toBeNull();
    expect(onMessage).toHaveBeenLastCalledWith(
      "연속 제작 완료 · 3회 · ★ 1개 · 숙련도 +30",
    );
    expect(hook.result.current.craftProgress).toBeNull();
  });

  it("중간에 실패하면 멈추고 그때까지의 합계와 이유를 알린다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okCraft(2))
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, error: "insufficient_materials" },
          { status: 409 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { hook, onMessage, onAfterCraft } = setup();

    await act(async () => {
      await hook.result.current.craft("tier2_weapon" as never, "normal", false, 5);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAfterCraft).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenLastCalledWith(
      "연속 제작 멈춤 · 5회 중 1회 · ★★ 1개 · 숙련도 +10 · 제작 재료가 부족합니다.",
    );
  });

  it("중지를 누르면 진행 중인 제작까지만 하고 멈춘다", async () => {
    let releaseFirst: (value: Response) => void = () => {};
    const fetchMock = vi.fn()
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (releaseFirst = resolve)),
      )
      .mockResolvedValue(okCraft(0));
    vi.stubGlobal("fetch", fetchMock);
    const { hook, onMessage } = setup();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = hook.result.current.craft("tier2_weapon" as never, "normal", false, 10);
    });
    await waitFor(() =>
      expect(hook.result.current.craftProgress).toMatchObject({ done: 0, total: 10 }),
    );
    act(() => hook.result.current.stopCraft());
    await act(async () => {
      releaseFirst(okCraft(0));
      await pending;
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenLastCalledWith(
      "연속 제작 중지 · 10회 중 1회 · 숙련도 +10",
    );
  });

  it("1회 제작은 지금처럼 결과 창을 연다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(okCraft(1)));
    const { hook } = setup();

    await act(async () => {
      await hook.result.current.craft("tier2_weapon" as never);
    });

    expect(hook.result.current.craftResult).toMatchObject({
      itemName: "시험 대검",
      craftQualityLevel: 1,
    });
  });
});
