import { describe, expect, it } from "vitest";
import {
  DEFAULT_WOODCUTTING_SPOT_ID,
  WOODCUTTING_MATERIALS,
  WOODCUTTING_SPOTS,
  WOODCUTTING_SPOT_IDS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
  woodcuttingTreeForSpot,
} from "./woodcuttingSpots";

describe("벌목 장소 카탈로그", () => {
  it("6개 숲과 기본 숲을 제공한다", () => {
    expect(WOODCUTTING_SPOT_IDS).toHaveLength(6);
    expect(isWoodcuttingSpotId(DEFAULT_WOODCUTTING_SPOT_ID)).toBe(true);
  });

  it("각 숲은 서로 다른 나무 1종만 가진다", () => {
    const seen = new Set<string>();
    const materials = new Set<string>();
    for (const spot of Object.values(WOODCUTTING_SPOTS)) {
      const tree = woodcuttingTreeForSpot(spot);
      expect(tree).toBe(WOODCUTTING_TREES[spot.treeId]);
      expect(seen.has(spot.treeId)).toBe(false);
      expect(WOODCUTTING_MATERIALS[tree.materialId]).toBeDefined();
      seen.add(spot.treeId);
      materials.add(tree.materialId);
    }
    expect(seen.size).toBe(6);
    expect(materials.size).toBe(6);
  });
});
