import { describe, expect, it } from "vitest";
import {
  ADVENTURER_ASSOCIATION_FACILITY_IDS,
  associationUpgradeCost,
  isAdventurerAssociationFacilityId,
  parseWeeklyFacilitySourceState,
  resolveWeeklyFacilitySourceClaim,
  weeklyFacilitySourcesAfterGuildJoin,
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
        training_ground: {
          weekKey: "2026-08-03",
          source: "guild",
          guildId: 7,
        },
        trade_post: { weekKey: 3, source: "guild" },
        guild_warehouse: { weekKey: "2026-08-03", source: "association" },
      }),
    ).toEqual({
      dining_hall: { weekKey: "2026-08-03", source: "association" },
      training_ground: {
        weekKey: "2026-08-03",
        source: "guild",
        guildId: 7,
      },
    });
  });

  it.each([
    "guild_smithy",
    "training_ground",
    "alchemy_workshop",
    "dining_hall",
  ] as const)("협회에서 사용한 %s는 길드 가입 후 같은 주 기록을 승계한다", (facilityId) => {
    expect(
      resolveWeeklyFacilitySourceClaim(
        facilityId,
        { weekKey: "2026-08-10", source: "association" },
        { weekKey: "2026-08-10", source: "guild", guildId: 7 },
      ),
    ).toEqual({
      ok: true,
      selection: { weekKey: "2026-08-10", source: "guild", guildId: 7 },
    });
  });

  it("협회 교역소 사용 이력은 같은 주 길드 교역소로 옮기지 않는다", () => {
    expect(
      resolveWeeklyFacilitySourceClaim(
        "trade_post",
        { weekKey: "2026-08-10", source: "association" },
        { weekKey: "2026-08-10", source: "guild", guildId: 7 },
      ),
    ).toEqual({ ok: false, selected: "association" });
  });

  it("길드 시설을 사용한 뒤 같은 주 협회로 돌아가는 것을 막는다", () => {
    expect(
      resolveWeeklyFacilitySourceClaim(
        "training_ground",
        { weekKey: "2026-08-10", source: "guild", guildId: 7 },
        { weekKey: "2026-08-10", source: "association" },
      ),
    ).toEqual({ ok: false, selected: "guild" });
  });

  it("같은 주에 다른 길드 시설로 옮겨 중복 이용하는 것을 막는다", () => {
    expect(
      resolveWeeklyFacilitySourceClaim(
        "dining_hall",
        { weekKey: "2026-08-10", source: "guild", guildId: 3 },
        { weekKey: "2026-08-10", source: "guild", guildId: 7 },
      ),
    ).toEqual({ ok: false, selected: "guild" });
  });

  it("길드 ID가 없는 기존 주간 기록은 현재 길드에 한 번 귀속한다", () => {
    expect(
      resolveWeeklyFacilitySourceClaim(
        "training_ground",
        { weekKey: "2026-08-10", source: "guild" },
        { weekKey: "2026-08-10", source: "guild", guildId: 7 },
      ),
    ).toEqual({
      ok: true,
      selection: { weekKey: "2026-08-10", source: "guild", guildId: 7 },
    });
  });

  it("가입 시 안전한 협회 시설만 길드 출처로 바꾼다", () => {
    expect(
      weeklyFacilitySourcesAfterGuildJoin(
        {
          training_ground: { weekKey: "2026-08-10", source: "association" },
          dining_hall: { weekKey: "2026-08-10", source: "association" },
          trade_post: { weekKey: "2026-08-10", source: "association" },
          alchemy_workshop: { weekKey: "2026-08-03", source: "association" },
        },
        "2026-08-10",
        7,
      ),
    ).toEqual({
      state: {
        training_ground: {
          weekKey: "2026-08-10",
          source: "guild",
          guildId: 7,
        },
        dining_hall: {
          weekKey: "2026-08-10",
          source: "guild",
          guildId: 7,
        },
        trade_post: { weekKey: "2026-08-10", source: "association" },
        alchemy_workshop: { weekKey: "2026-08-03", source: "association" },
      },
      transferred: ["training_ground", "dining_hall"],
    });
  });
});
