// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChuseokEvent } from "./useChuseokEvent";
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => async () => {} }));
vi.mock("@/lib/adaptiveVisiblePolling", () => ({ startAdaptiveVisiblePolling: () => () => {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("추석 이벤트 요청", () => {
  it("공격 응답이 유실되어도 같은 요청 키로 재시도한다", async () => {
    const ids: string[] = [];
    const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        ids.push(JSON.parse(options.body as string).requestId);
        if (ids.length === 1) throw new Error("network");
        return Response.json({ ok: true, damageDealt: 100, stagesCleared: 0, replay: {} });
      }
      return Response.json({ ok: true, phase: "active" });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useChuseokEvent());
    await act(async () => { await result.current.attack(); });
    await waitFor(() => expect(result.current.lastAttack?.damageDealt).toBe(100));
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  });
  it("실패한 출석은 성공으로 표시하지 않고 처리 중 상태를 해제한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Response.json({ ok: false, error: "already_claimed" }, { status: 409 }) : Response.json({ ok: true })));
    const { result } = renderHook(() => useChuseokEvent());
    await act(async () => { await result.current.attend(); });
    expect(result.current.notice?.tone).toBe("error");
    expect(result.current.busy).toBeNull();
  });
});
