// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setChuseokReminder, useChuseokReminder } from "./useChuseokReminder";
import { useChuseokEvent } from "./useChuseokEvent";
import type { ChuseokState } from "../data/v2/chuseokEvent";

vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => async () => {} }));
vi.mock("@/lib/adaptiveVisiblePolling", () => ({ startAdaptiveVisiblePolling: () => () => {} }));
const state: ChuseokState = {
  ok: true, phase: "active",
  window: { startsAt: Date.parse("2026-09-22T00:00:00+09:00"), endsAt: Date.parse("2026-10-02T00:00:00+09:00") },
  attendance: { todayKey: "2026-09-23", claimedCount: 1, claimedToday: true, complete: false, canClaim: false, nextReward: 5 },
  raid: { stage: 1, hp: 100_000_000, maxHp: 100_000_000, myDamage: 100, attacksRemaining: 0, participantCount: 1 },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T12:00:00+09:00"));
  setChuseokReminder(state);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(state)));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("추석 참여 알림 상태", () => {
  it("출석 또는 공격 기회만 남아도 켜지고 모두 마치면 구독자 전체에서 꺼진다", () => {
    const first = renderHook(useChuseokReminder);
    const second = renderHook(useChuseokReminder);
    expect(first.result.current).toBe(false);
    act(() => setChuseokReminder({ ...state, attendance: { ...state.attendance, canClaim: true } }));
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);
    act(() => setChuseokReminder({ ...state, raid: { ...state.raid, attacksRemaining: 1 } }));
    expect(first.result.current).toBe(true);
    act(() => setChuseokReminder(state));
    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe(false);
  });

  it.each(["pending", "ended"] as const)("%s 상태는 남은 횟수가 있어도 알리지 않는다", (phase) => {
    setChuseokReminder({ ...state, phase, raid: { ...state.raid, attacksRemaining: 3 } });
    expect(renderHook(useChuseokReminder).result.current).toBe(false);
  });

  it("동시에 열린 메뉴·탭은 캐시를 재사용하고 만료 시 요청을 합친다", async () => {
    renderHook(useChuseokReminder);
    renderHook(useChuseokReminder);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("자정에는 5분 캐시가 남아 있어도 오늘 참여 기회를 다시 확인한다", async () => {
    vi.setSystemTime(new Date("2026-09-23T23:59:30+09:00"));
    setChuseokReminder(state);
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...state, raid: { ...state.raid, attacksRemaining: 3 } }));
    const { result } = renderHook(useChuseokReminder);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("이벤트 시작 경계에서는 캐시 만료를 기다리지 않고 다시 조회한다", async () => {
    setChuseokReminder({ ...state, phase: "pending", window: { ...state.window!, startsAt: Date.now() + 30_000 } });
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...state, raid: { ...state.raid, attacksRemaining: 3 } }));
    const { result } = renderHook(useChuseokReminder);
    expect(result.current).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current).toBe(true);
  });

  it("기간이 끝나면 조회가 실패해도 알림을 끈다", async () => {
    setChuseokReminder({ ...state, window: { ...state.window!, endsAt: Date.now() + 30_000 }, raid: { ...state.raid, attacksRemaining: 3 } });
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(useChuseokReminder);
    expect(result.current).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current).toBe(false);
  });

  it("늦게 도착한 조회가 참여 완료 상태를 덮어쓰지 않는다", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(useChuseokReminder);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    act(() => setChuseokReminder(state));
    await act(async () => { resolve(Response.json({ ...state, raid: { ...state.raid, attacksRemaining: 3 } })); });
    expect(result.current).toBe(false);
  });

  it("출석 수령 뒤 이벤트 화면의 재조회가 메뉴 알림을 끈다", async () => {
    setChuseokReminder({ ...state, attendance: { ...state.attendance, canClaim: true } });
    vi.mocked(fetch).mockImplementation(async (_url, options) => Response.json(options?.method === "POST" ? { ok: true, reward: 5 } : state));
    const reminder = renderHook(useChuseokReminder);
    const event = renderHook(useChuseokEvent);
    expect(reminder.result.current).toBe(true);
    await act(async () => { await event.result.current.attend(); });
    expect(reminder.result.current).toBe(false);
  });
});
