import { describe, expect, it } from "vitest";
import {
  nextSettlementBuildingUpgrade,
  settlementBuildingMaxLevel,
} from "./settlement";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";
import { MINING_MATERIAL_ID } from "./miningSpots";

describe("길드 시설 최대 레벨", () => {
  it("길드 시설 확장 5종만 길드에서 Lv.10까지 열린다", () => {
    expect(settlementBuildingMaxLevel("training_ground", "guild_facility")).toBe(10);
    expect(settlementBuildingMaxLevel("guild_smithy", "guild_facility")).toBe(5);
    expect(settlementBuildingMaxLevel("guild_warehouse", "guild_facility")).toBe(5);
    expect(settlementBuildingMaxLevel("training_ground", "association")).toBe(5);
    expect(settlementBuildingMaxLevel("training_ground", "village")).toBe(5);
  });

  it("범위를 주지 않으면 Lv.5에서 다음 단계가 없다", () => {
    expect(nextSettlementBuildingUpgrade("trade_post", 5)).toBeNull();
    expect(nextSettlementBuildingUpgrade("trade_post", 5, "guild_facility")?.level).toBe(6);
    expect(nextSettlementBuildingUpgrade("trade_post", 10, "guild_facility")).toBeNull();
    expect(nextSettlementBuildingUpgrade("guild_smithy", 5, "guild_facility")).toBeNull();
  });

  it("Lv.6~10 공통 비용", () => {
    const lv6 = nextSettlementBuildingUpgrade("dining_hall", 5, "guild_facility")!;
    expect(lv6.cost).toEqual({
      [WOODCUTTING_MATERIAL_ID.oak]: 3000,
      [MINING_MATERIAL_ID.gold]: 3000,
      [WOODCUTTING_MATERIAL_ID.cedar]: 2500,
      [MINING_MATERIAL_ID.mythril]: 2500,
      [WOODCUTTING_MATERIAL_ID.cypress]: 2000,
      [MINING_MATERIAL_ID.adamantite]: 2000,
      gold: 400_000_000,
      fame: 4000,
    });
    const lv10 = nextSettlementBuildingUpgrade("dining_hall", 9, "guild_facility")!;
    expect(lv10.cost.gold).toBe(1_200_000_000);
    expect(lv10.cost.fame).toBe(10_000);
    expect(lv10.cost[WOODCUTTING_MATERIAL_ID.cypress]).toBe(7500);
    for (const id of ["training_ground", "exploration_hq", "alchemy_workshop", "trade_post"] as const) {
      expect(nextSettlementBuildingUpgrade(id, 7, "guild_facility")?.cost).toEqual(
        nextSettlementBuildingUpgrade("dining_hall", 7, "guild_facility")?.cost,
      );
    }
  });
});
