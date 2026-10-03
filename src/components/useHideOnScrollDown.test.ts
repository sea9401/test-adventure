// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useHideOnScrollDown } from "./useHideOnScrollDown";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

afterEach(() => scrollTo(0));

describe("useHideOnScrollDown", () => {
  it("아래로 기준 이상 스크롤하면 숨기고 위로 스크롤하면 다시 보인다", () => {
    const { result } = renderHook(() => useHideOnScrollDown({ threshold: 24 }));
    expect(result.current).toBe(false);

    act(() => scrollTo(10));
    expect(result.current).toBe(false);
    act(() => scrollTo(80));
    expect(result.current).toBe(true);
    act(() => scrollTo(60));
    expect(result.current).toBe(false);
  });

  it("맨 위 근처에서는 항상 보인다", () => {
    const { result } = renderHook(() => useHideOnScrollDown({ threshold: 24 }));
    act(() => scrollTo(200));
    act(() => scrollTo(400));
    expect(result.current).toBe(true);
    act(() => scrollTo(0));
    expect(result.current).toBe(false);
  });

  it("비활성화하면 스크롤해도 숨기지 않는다", () => {
    const { result } = renderHook(() => useHideOnScrollDown({ disabled: true }));
    act(() => scrollTo(300));
    expect(result.current).toBe(false);
  });
});
