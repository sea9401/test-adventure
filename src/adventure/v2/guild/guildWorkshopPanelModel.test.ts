import { describe, expect, it } from "vitest";
import {
  ERROR_TEXT,
  blacksmithFocusLabel,
  blacksmithSpecialtyLabel,
  blacksmithStructureLabel,
  matchesDismantleScopeFilter,
  matchesDismantleTierFilter,
  workshopEquipmentCodexStatus,
  workshopEquipmentDisplayTier,
  workshopEquipmentTierLabel,
  type DismantleCandidateView,
} from "./guildWorkshopPanelModel";

function candidate(
  tier: number,
  overrides: Partial<DismantleCandidateView> = {},
): DismantleCandidateView {
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
    ...overrides,
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

  it("shows blocked crafted equipment in the craft-only filter", () => {
    const blockedCraftOnly = candidate(4, {
      canDismantle: false,
      blockedReason: "no_material",
      craftOnly: true,
    });
    expect(matchesDismantleScopeFilter(blockedCraftOnly, "craftOnly")).toBe(
      true,
    );
    expect(matchesDismantleScopeFilter(blockedCraftOnly, "can")).toBe(false);
  });
});

describe("guild workshop equipment codex status", () => {
  const registeredIds = new Set(["registered-equipment"]);

  it("distinguishes registered and unregistered recipe equipment", () => {
    expect(
      workshopEquipmentCodexStatus(
        "registered-equipment",
        registeredIds,
        "ready",
      ),
    ).toBe("registered");
    expect(
      workshopEquipmentCodexStatus(
        "unregistered-equipment",
        registeredIds,
        "ready",
      ),
    ).toBe("unregistered");
  });

  it("does not mislabel loading or failed codex reads as unregistered", () => {
    expect(
      workshopEquipmentCodexStatus(
        "unregistered-equipment",
        registeredIds,
        "loading",
      ),
    ).toBe("loading");
    expect(
      workshopEquipmentCodexStatus(
        "unregistered-equipment",
        registeredIds,
        "error",
      ),
    ).toBe("error");
  });
});

describe("blacksmith specialization labels", () => {
  it("uses the approved Korean names", () => {
    expect(blacksmithSpecialtyLabel("weapon")).toBe("무기 단조");
    expect(blacksmithSpecialtyLabel("jewelry")).toBe("장신구 세공");
    expect(blacksmithFocusLabel("armor_resistance")).toBe("저항");
    expect(blacksmithStructureLabel("stable")).toBe("안정 제작");
  });

  it("provides actionable server error copy", () => {
    expect(ERROR_TEXT.specialty_locked).toContain("바꿀 수 없습니다");
    expect(ERROR_TEXT.technique_locked).toContain("해금");
    expect(ERROR_TEXT.insufficient_catalyst).toContain("촉매");
    expect(ERROR_TEXT.pending_inspection).toContain("최종 검수");
    expect(ERROR_TEXT.inspection_not_found).toContain("검수");
  });
});
