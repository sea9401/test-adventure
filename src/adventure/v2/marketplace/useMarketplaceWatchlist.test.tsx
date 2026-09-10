// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MARKETPLACE_WATCHLIST_KEY, useMarketplaceWatchlist } from "./useMarketplaceWatchlist";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it("손상된 저장값을 무시하고 유효한 등록 번호만 복원한다", () => {
  localStorage.setItem(MARKETPLACE_WATCHLIST_KEY, JSON.stringify([1, 1, "2", -3, 4.5, null, 9]));
  const { result } = renderHook(useMarketplaceWatchlist);
  expect([...result.current.ids]).toEqual([1, 9]);
  act(() => result.current.toggle(1));
  expect(JSON.parse(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY)!)).toEqual([9]);
});

it("200건 한도를 안내하고 종료된 관심 매물도 전체 비우기로 지울 수 있다", () => {
  localStorage.setItem(MARKETPLACE_WATCHLIST_KEY, JSON.stringify(Array.from({ length: 200 }, (_, i) => i + 1)));
  const { result } = renderHook(useMarketplaceWatchlist);
  act(() => result.current.toggle(201));
  expect(result.current.ids.size).toBe(200);
  expect(result.current.error).toContain("최대 200개");
  act(() => result.current.clear());
  expect(result.current.ids.size).toBe(0);
  expect(localStorage.getItem(MARKETPLACE_WATCHLIST_KEY)).toBe("[]");
});

it("저장소 쓰기 실패가 화면을 중단시키지 않고 임시 선택임을 안내한다", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const { result } = renderHook(useMarketplaceWatchlist);
  act(() => result.current.toggle(1));
  expect(result.current.ids.has(1)).toBe(true);
  expect(result.current.error).toContain("저장하지 못했어요");
});
