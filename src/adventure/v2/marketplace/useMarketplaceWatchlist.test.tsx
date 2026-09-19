// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MARKETPLACE_WATCHLIST_KEY, useMarketplaceWatchlist } from "./useMarketplaceWatchlist";

let serverIds: number[];
let fail: boolean;
const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
  if (fail) return Response.json({ ok: false }, { status: 500 });
  if (init?.method === "PATCH") {
    const body = JSON.parse(String(init.body));
    if (body.action === "add") serverIds = [...new Set([...serverIds, body.id])];
    if (body.action === "remove") serverIds = serverIds.filter(id => id !== body.id);
    if (body.action === "clear") serverIds = [];
    if (body.action === "import") serverIds = [...new Set([...serverIds, ...body.ids])];
  }
  return Response.json({ ok: true, ids: serverIds });
});
beforeEach(() => { localStorage.clear(); serverIds = [9]; fail = false; fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it("빈 브라우저도 계정 목록을 복원하고 저장한 결과를 재진입 시 읽는다", async () => {
  const first = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect([...first.result.current.ids]).toEqual([9]));
  await act(async () => first.result.current.toggle(10));
  await waitFor(() => expect([...first.result.current.ids]).toEqual([9, 10]));
  first.unmount();
  const second = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect([...second.result.current.ids]).toEqual([9, 10]));
  expect(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY)).toBeNull();
});

it("계정 없는 로컬 목록은 명시적으로 가져오며 서버 목록을 보존한다", async () => {
  localStorage.setItem(MARKETPLACE_WATCHLIST_KEY, JSON.stringify([1, 1, "2", -3, 4.5, null, 9]));
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect([...result.current.ids]).toEqual([9]));
  await act(async () => result.current.importLegacy());
  await waitFor(() => expect([...result.current.ids]).toEqual([9, 1]));
  expect(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY)).toBeNull();
});

it("저장 실패 시 기존 선택을 보존하고 재시도할 수 있다", async () => {
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect(result.current.ids.has(9)).toBe(true));
  fail = true;
  await act(async () => result.current.toggle(9));
  await waitFor(() => expect(result.current.error).toContain("저장하지 못했어요"));
  expect(result.current.ids.has(9)).toBe(true);
  fail = false;
  await act(async () => result.current.toggle(9));
  await waitFor(() => expect(result.current.ids.size).toBe(0));
});

it("창으로 돌아오면 다른 기기의 변경을 읽는다", async () => {
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect(result.current.ids.has(9)).toBe(true));
  serverIds = [12];
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect([...result.current.ids]).toEqual([12]));
});

it("최초 읽기 실패 후 다시 불러오며 읽기 전에는 저장하지 않는다", async () => {
  fail = true;
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect(result.current.error).toContain("불러오지 못했어요"));
  await act(async () => result.current.toggle(1));
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "PATCH")).toBe(true);
  fail = false;
  await act(async () => result.current.reload());
  await waitFor(() => expect([...result.current.ids]).toEqual([9]));
});

it("가져오기 실패 시 로컬 목록과 서버 선택을 보존한다", async () => {
  localStorage.setItem(MARKETPLACE_WATCHLIST_KEY, "[1]");
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect(result.current.ids.has(9)).toBe(true));
  fail = true;
  await act(async () => result.current.importLegacy());
  expect(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY)).toBe("[1]");
  expect([...result.current.ids]).toEqual([9]);
  expect(result.current.legacyCount).toBe(1);
});

it("저장이 끝나기 전 중복 조작은 보내지 않고 전체 비우기를 저장한다", async () => {
  const { result } = renderHook(useMarketplaceWatchlist);
  await waitFor(() => expect(result.current.ids.has(9)).toBe(true));
  await act(async () => { result.current.clear(); result.current.toggle(1); });
  await waitFor(() => expect(result.current.ids.size).toBe(0));
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
});
