// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { usePagination } from "./usePagination";

afterEach(cleanup);
it("검색 변경과 목록 축소가 겹치면 마지막 페이지 보정보다 초기화를 우선한다", () => {
  const { result, rerender } = renderHook(
    ({ items, query }) => usePagination(items, 1, query),
    { initialProps: { items: [1, 2, 3], query: "" } },
  );
  act(() => result.current.setPage(2));
  rerender({ items: [1, 2], query: "철검" });
  expect(result.current.page).toBe(0);
  expect(result.current.pageItems).toEqual([1]);
});

it("검색 변경 없이 목록이 줄면 마지막 유효 페이지로 보정한다", () => {
  const { result, rerender } = renderHook(({ items }) => usePagination(items, 1), {
    initialProps: { items: [1, 2, 3] },
  });
  act(() => result.current.setPage(2));
  rerender({ items: [1, 2] });
  expect(result.current.page).toBe(1);
  rerender({ items: [] });
  expect(result.current.page).toBe(0);
  expect(result.current.pageItems).toEqual([]);
});
