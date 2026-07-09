import { describe, expect, it } from "vitest";
import { FISH, type FishTier } from "./fish";
import {
  DEFAULT_FISHING_SPOT_ID,
  FISHING_SPOTS,
  FISHING_SPOT_IDS,
  getFishingSpot,
  isFishingSpotId,
  tierCountsForSpot,
} from "./fishingSpots";

describe("낚시터 카탈로그", () => {
  it("기본 6개 낚시터와 기본 낚시터를 제공한다", () => {
    expect(FISHING_SPOT_IDS).toHaveLength(6);
    expect(DEFAULT_FISHING_SPOT_ID).toBe("village_pier");
    expect(getFishingSpot("unknown").id).toBe(DEFAULT_FISHING_SPOT_ID);
  });

  it("모든 낚시터는 유효한 어종 풀과 대표 어종을 가진다", () => {
    for (const spot of Object.values(FISHING_SPOTS)) {
      expect(isFishingSpotId(spot.id)).toBe(true);
      expect(spot.fishIds.length).toBeGreaterThanOrEqual(10);
      expect(spot.featuredFishIds.length).toBeGreaterThan(0);
      for (const fishId of spot.fishIds) {
        expect(FISH[fishId], `${spot.id}:${fishId}`).toBeTruthy();
      }
      for (const fishId of spot.featuredFishIds) {
        expect(spot.fishIds).toContain(fishId);
      }
    }
  });

  it("난이도별 역할이 나뉘고 어려운 낚시터에는 희귀 이상 어종이 있다", () => {
    expect(FISHING_SPOTS.village_pier.difficulty).toBe("easy");
    expect(FISHING_SPOTS.reed_wetlands.difficulty).toBe("normal");
    expect(FISHING_SPOTS.rocky_coast.difficulty).toBe("normal");

    const highTiers: readonly FishTier[] = ["rare", "epic", "legendary"];
    for (const id of ["mist_lake", "black_tideflat", "rapid_gorge"] as const) {
      const spot = FISHING_SPOTS[id];
      expect(spot.difficulty).toBe("hard");
      const counts = tierCountsForSpot(spot);
      expect(
        highTiers.reduce((sum, tier) => sum + (counts[tier] ?? 0), 0),
      ).toBeGreaterThan(0);
    }
  });
});
