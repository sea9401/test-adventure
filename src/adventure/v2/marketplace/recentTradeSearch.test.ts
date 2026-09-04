import { describe, expect, it } from "vitest";
import { filterMarketplaceRecentTrades } from "./recentTradeSearch";

const rows = [
  { id: 1, itemName: "철광석" },
  { id: 2, itemName: "Silver Ore" },
  { id: 3, itemName: "두박한 밀빵 (일반)" },
];

describe("최근 거래 품목 검색", () => {
  it("빈 검색어이면 원래 목록을 그대로 반환한다", () => {
    expect(filterMarketplaceRecentTrades(rows, "   ")).toBe(rows);
  });

  it("품목명의 일부를 대소문자 구분 없이 찾는다", () => {
    expect(filterMarketplaceRecentTrades(rows, "  silver ")).toEqual([
      rows[1],
    ]);
    expect(filterMarketplaceRecentTrades(rows, "밀빵")).toEqual([rows[2]]);
  });

  it("일치하는 품목이 없으면 빈 목록을 반환한다", () => {
    expect(filterMarketplaceRecentTrades(rows, "금괴")).toEqual([]);
  });
});
