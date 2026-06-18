import { describe, expect, it } from "vitest";
import { paginationRange } from "./Pagination";

// page 인자는 0-기반, 반환은 1-기반 페이지 번호 + "ellipsis" 마커.

describe("paginationRange", () => {
  it("페이지 ≤ 7 이면 전부 나열 (< 1 2 3 4 5 >)", () => {
    expect(paginationRange(0, 1)).toEqual([1]);
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("페이지 > 7 이면 양 끝 + 현재±1 만, 사이는 ellipsis", () => {
    expect(paginationRange(0, 10)).toEqual([1, 2, "ellipsis", 10]); // 현재 1
    expect(paginationRange(4, 10)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ]); // 현재 5
    expect(paginationRange(9, 10)).toEqual([1, "ellipsis", 9, 10]); // 현재 10
  });

  it("항상 1과 마지막 페이지를 포함한다", () => {
    const r = paginationRange(5, 20);
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(20);
  });
});
