import { describe, expect, it } from "vitest";
import {
  matchesDismantleTierFilter,
  workshopEquipmentDisplayTier,
  workshopEquipmentTierLabel,
  type DismantleCandidateView,
} from "./guildWorkshopPanelModel";

function candidate(tier: number): DismantleCandidateView {
  return {
    iid: `item-${tier}`,
    itemId: `equipment-${tier}`,
    itemName: "테스트 장비",
    slot: "weapon",
    tier,
    craftOnly: true,
    enhanceLevel: 0,
    craftQualityLevel: 0,
    masterwork: false,
    locked: false,
    equipped: false,
    rewards: {},
    artisanXp: 0,
    canDismantle: true,
  };
}

describe("guild workshop equipment tier display", () => {
  it("compresses internal catalog tiers into the common 1T-5T labels", () => {
    expect([1, 4, 7, 10, 13].map(workshopEquipmentTierLabel)).toEqual([
      "1T",
      "2T",
      "3T",
      "4T",
      "5T",
    ]);
    expect(workshopEquipmentDisplayTier(12)).toBe(4);
  });

  it("filters dismantle candidates by displayed tier", () => {
    expect(matchesDismantleTierFilter(candidate(4), "display2")).toBe(true);
    expect(matchesDismantleTierFilter(candidate(6), "display2")).toBe(true);
    expect(matchesDismantleTierFilter(candidate(7), "display3")).toBe(true);
    expect(matchesDismantleTierFilter(candidate(12), "display4")).toBe(true);
    expect(matchesDismantleTierFilter(candidate(13), "display5")).toBe(true);
    expect(matchesDismantleTierFilter(candidate(12), "display3")).toBe(false);
  });
});
