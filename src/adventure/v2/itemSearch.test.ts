import { describe, expect, it } from "vitest";
import { filterItemCounts, matchesItemSearch } from "./itemSearch";

describe("보유 아이템 이름 검색", () => {
  it("부분 이름과 앞뒤 공백, 영문 대소문자를 처리한다", () => {
    expect(matchesItemSearch("고급 철검", " 철검 ")).toBe(true);
    expect(matchesItemSearch("SP 열매", "sp")).toBe(true);
    expect(matchesItemSearch("철검", "갑옷")).toBe(false);
    expect(matchesItemSearch(undefined, "철검")).toBe(false);
    expect(matchesItemSearch(undefined, "  ")).toBe(true);
  });
  it("표시할 보유 수량만 걸러내며 원본을 보존하고 초기화한다", () => {
    const counts = { iron: 12, wood: 4 };
    const names = { iron: "철광석", wood: "목재" };
    expect(filterItemCounts(counts, "철", (id) => names[id])).toEqual({ iron: 12 });
    expect(filterItemCounts(counts, "없음", (id) => names[id])).toEqual({});
    expect(filterItemCounts(counts, "", (id) => names[id])).toBe(counts);
    expect(counts).toEqual({ iron: 12, wood: 4 });
  });
});
