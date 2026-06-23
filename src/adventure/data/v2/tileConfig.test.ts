import { describe, it, expect } from "vitest";
import {
  TILE_SETTLEMENT_TIERS,
  TILE_PROMOTE_COST,
  tileNextTier,
  isTileSettlementTier,
} from "./tileConfig";

// 자유 타일 지도 — 개척 정착지 티어 사슬 순수 로직.

describe("tileNextTier — 승격 사슬", () => {
  it("frontier→village→city→metropolis→null(최고)", () => {
    expect(tileNextTier("frontier")).toBe("village");
    expect(tileNextTier("village")).toBe("city");
    expect(tileNextTier("city")).toBe("metropolis");
    expect(tileNextTier("metropolis")).toBeNull();
  });
});

describe("TILE_PROMOTE_COST — 승격 비용", () => {
  it("영지 획득 단계(frontier→village)는 유의미한 비용, 최고 티어는 0", () => {
    expect(TILE_PROMOTE_COST.frontier).toBeGreaterThan(0);
    expect(TILE_PROMOTE_COST.metropolis).toBe(0);
  });
});

describe("isTileSettlementTier — 타입 가드", () => {
  it("유효 티어만 true", () => {
    for (const t of TILE_SETTLEMENT_TIERS)
      expect(isTileSettlementTier(t)).toBe(true);
    expect(isTileSettlementTier("bogus")).toBe(false);
    expect(isTileSettlementTier(123)).toBe(false);
  });
});
