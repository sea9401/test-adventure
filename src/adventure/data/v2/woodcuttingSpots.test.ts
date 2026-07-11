import { describe, expect, it } from "vitest";
import {
  DEFAULT_WOODCUTTING_SPOT_ID,
  WOODCUTTING_SPOTS,
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
  woodcuttingTreeNames,
} from "./woodcuttingSpots";

describe("벌목 장소 카탈로그", () => {
  it("4개 숲과 기본 숲을 제공한다", () => {
    expect(WOODCUTTING_SPOT_IDS).toHaveLength(4);
    expect(isWoodcuttingSpotId(DEFAULT_WOODCUTTING_SPOT_ID)).toBe(true);
  });

  it("각 숲은 서로 다른 3개 수종과 100의 출현 가중치를 가진다", () => {
    const seen = new Set<string>();
    for (const spot of Object.values(WOODCUTTING_SPOTS)) {
      expect(spot.trees).toHaveLength(3);
      expect(spot.trees.reduce((sum, tree) => sum + tree.weight, 0)).toBe(100);
      expect(woodcuttingTreeNames(spot)).toHaveLength(3);
      for (const { treeId, weight } of spot.trees) {
        expect(WOODCUTTING_TREES[treeId]).toBeDefined();
        expect(weight).toBeGreaterThan(0);
        expect(seen.has(treeId)).toBe(false);
        seen.add(treeId);
      }
    }
    expect(seen.size).toBe(12);
  });
});
