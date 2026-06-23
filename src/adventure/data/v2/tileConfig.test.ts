import { describe, it, expect } from "vitest";
import {
  TILE_BOARD_SIZE,
  TILE_SETTLEMENT_TIERS,
  TILE_PROMOTE_COST,
  areTilesAdjacent4,
  tileNeighbors4,
  tileNextTier,
  tilePrevTier,
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

describe("areTilesAdjacent4 — 4방향(상하좌우) 인접", () => {
  it("상하좌우만 true, 대각선·자기자신·원거리 false", () => {
    expect(areTilesAdjacent4(4, 4, 4, 3)).toBe(true);
    expect(areTilesAdjacent4(4, 4, 4, 5)).toBe(true);
    expect(areTilesAdjacent4(4, 4, 3, 4)).toBe(true);
    expect(areTilesAdjacent4(4, 4, 5, 4)).toBe(true);
    expect(areTilesAdjacent4(4, 4, 4, 4)).toBe(false); // 자기 자신
    expect(areTilesAdjacent4(4, 4, 5, 5)).toBe(false); // 대각선
    expect(areTilesAdjacent4(4, 4, 4, 6)).toBe(false); // 2칸
  });
});

describe("tileNeighbors4 — 보드 경계 내 4이웃", () => {
  it("내부 칸 = 4개", () => {
    expect(tileNeighbors4(4, 4)).toHaveLength(4);
  });
  it("모서리(0,0) = 2개(경계 밖 제외)", () => {
    const n = tileNeighbors4(0, 0);
    expect(n).toHaveLength(2);
    expect(n).toContainEqual({ col: 1, row: 0 });
    expect(n).toContainEqual({ col: 0, row: 1 });
  });
  it("끝 모서리 = 2개", () => {
    expect(
      tileNeighbors4(TILE_BOARD_SIZE - 1, TILE_BOARD_SIZE - 1),
    ).toHaveLength(2);
  });
  it("이웃은 모두 대상과 4방향 인접", () => {
    for (const n of tileNeighbors4(4, 4)) {
      expect(areTilesAdjacent4(4, 4, n.col, n.row)).toBe(true);
    }
  });
});

describe("tilePrevTier — 정복 강등 사슬", () => {
  it("metropolis→city→village→frontier→null(최하)", () => {
    expect(tilePrevTier("metropolis")).toBe("city");
    expect(tilePrevTier("city")).toBe("village");
    expect(tilePrevTier("village")).toBe("frontier");
    expect(tilePrevTier("frontier")).toBeNull();
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
