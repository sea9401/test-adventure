// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DUNGEON_THEME_VISIBILITY_STORAGE_KEY } from "./dungeonThemeVisibility";
import { useDungeonThemeVisibility } from "./useDungeonThemeVisibility";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("사냥터 표시 설정 계정 동기화", () => {
  it("계정 설정을 우선 적용하고 현재 기기에도 보관한다", async () => {
    localStorage.setItem(
      DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
      JSON.stringify([1]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: true, hiddenThemeStarts: [7, 13] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const { result } = renderHook(() => useDungeonThemeVisibility());

    await waitFor(() => {
      expect([...result.current.hiddenThemeStarts]).toEqual([7, 13]);
    });
    expect(
      JSON.parse(
        localStorage.getItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY) ?? "null",
      ),
    ).toEqual([7, 13]);
  });

  it("계정 설정이 없으면 기존 기기 값을 서버에 최초 저장한다", async () => {
    localStorage.setItem(
      DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
      JSON.stringify([13]),
    );
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response(
            JSON.stringify({ ok: true, hiddenThemeStarts: [13] }),
          )
        : new Response(
            JSON.stringify({ ok: true, hiddenThemeStarts: null }),
          ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDungeonThemeVisibility());

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v2/me/dungeon-visibility-settings",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ hiddenThemeStarts: [13] }),
        }),
      );
    });
    expect([...result.current.hiddenThemeStarts]).toEqual([13]);
  });

  it("조회 중 바꾼 기기 설정을 늦은 서버 응답이 덮어쓰지 않는다", async () => {
    localStorage.setItem(
      DUNGEON_THEME_VISIBILITY_STORAGE_KEY,
      JSON.stringify([1]),
    );
    let resolveGet: ((response: Response) => void) | null = null;
    const getResponse = new Promise<Response>((resolve) => {
      resolveGet = resolve;
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response(
            JSON.stringify({ ok: true, hiddenThemeStarts: [13] }),
          )
        : getResponse,
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDungeonThemeVisibility());
    await waitFor(() => {
      expect([...result.current.hiddenThemeStarts]).toEqual([1]);
    });

    act(() => {
      result.current.setHiddenThemeStarts(new Set([13]));
    });
    await act(async () => {
      resolveGet?.(
        new Response(
          JSON.stringify({ ok: true, hiddenThemeStarts: [7] }),
        ),
      );
      await getResponse;
    });

    expect([...result.current.hiddenThemeStarts]).toEqual([13]);
    expect(
      JSON.parse(
        localStorage.getItem(DUNGEON_THEME_VISIBILITY_STORAGE_KEY) ?? "null",
      ),
    ).toEqual([13]);
  });
});
