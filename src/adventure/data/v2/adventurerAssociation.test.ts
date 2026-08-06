import { describe, expect, it } from "vitest";
import {
  ADVENTURER_ASSOCIATION_FACILITY_IDS,
  associationUpgradeCost,
  isAdventurerAssociationFacilityId,
  parseWeeklyFacilitySourceState,
} from "./adventurerAssociation";
import { nextSettlementBuildingUpgrade } from "./settlement";

describe("모험가 협회 시설", () => {
  it("길드 창고를 공공시설에서 제외한다", () => {
    expect(ADVENTURER_ASSOCIATION_FACILITY_IDS).not.toContain("guild_warehouse");
    expect(isAdventurerAssociationFacilityId("guild_warehouse")).toBe(false);
    expect(isAdventurerAssociationFacilityId("dining_hall")).toBe(true);
  });

  it("길드 비용보다 큰 재료·골드 목표로 환산한다", () => {
    const next = nextSettlementBuildingUpgrade("dining_hall", 2);
    expect(next).not.toBeNull();
    const cost = associationUpgradeCost(next!);
    expect(cost.crop).toBe((next!.cost.crop ?? 0) * 10);
    expect(cost.gold).toBeGreaterThan(next!.cost.gold ?? 0);
    expect(cost.fame).toBeUndefined();
  });

  it("유효한 주간 이용처만 복원한다", () => {
    expect(
      parseWeeklyFacilitySourceState({
        dining_hall: { weekKey: "2026-08-03", source: "association" },
        trade_post: { weekKey: 3, source: "guild" },
        guild_warehouse: { weekKey: "2026-08-03", source: "association" },
      }),
    ).toEqual({
      dining_hall: { weekKey: "2026-08-03", source: "association" },
    });
  });
});
