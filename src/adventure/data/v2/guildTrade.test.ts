import { describe, expect, it } from "vitest";
import {
  ASSOCIATION_TRADE_SHOP_ITEMS,
  GUILD_TRADE_ITEMS,
  GUILD_TRADE_SHOP_ITEMS,
  associationTradeShopItem,
  guildTradeCompletionReward,
  guildTradeContractTarget,
  guildTradeItemsForWeek,
  guildTradeTokenReward,
  guildTradeWeeklyContributionPoints,
  parseGuildTradeUserState,
} from "./guildTrade";

describe("guildTrade", () => {
  it("주간 계약은 같은 길드·주차에서 결정적이고 서로 중복되지 않는다", () => {
    const first = guildTradeItemsForWeek("2026-07-13", 7, 5);
    const second = guildTradeItemsForWeek("2026-07-13", 7, 5);
    expect(second).toEqual(first);
    expect(new Set(first.map((item) => item.id))).toHaveLength(5);
    expect(new Set(first.map((item) => item.category))).toEqual(
      new Set(["wood", "ore", "farm", "fish"]),
    );
  });

  it("계약 수는 1~7 범위로 보정한다", () => {
    expect(guildTradeItemsForWeek("2026-07-13", 7, 0)).toHaveLength(1);
    expect(guildTradeItemsForWeek("2026-07-13", 7, 99)).toHaveLength(7);
  });

  it("납품 등록부 ID는 유일하고 모든 묶음·점수가 양수다", () => {
    expect(new Set(GUILD_TRADE_ITEMS.map((item) => item.id))).toHaveLength(
      GUILD_TRADE_ITEMS.length,
    );
    expect(
      GUILD_TRADE_ITEMS.every(
        (item) => item.batchSize > 0 && item.pointValue > 0,
      ),
    ).toBe(true);
  });

  it("농작물 계약은 성장 단계에 따라 적은 수량으로 같은 점수를 낸다", () => {
    expect(
      GUILD_TRADE_ITEMS.filter((item) => item.category === "farm").map(
        ({ sourceItemId, batchSize, pointValue }) => [
          sourceItemId,
          batchSize,
          pointValue,
        ],
      ),
    ).toEqual([
      ["wheat", 5, 1],
      ["herb", 4, 1],
      ["corn", 3, 1],
      ["tomato", 3, 1],
      ["strawberry", 2, 1],
      ["potato", 2, 1],
      ["onion", 1, 1],
      ["rice", 1, 1],
      ["soybean", 1, 1],
      ["sugarcane", 1, 2],
      ["cacao", 1, 2],
    ]);
  });

  it("계약 목표는 1인 40점에서 20인 230점까지 증가하고 이후 고정된다", () => {
    expect(guildTradeContractTarget(1)).toBe(40);
    expect(guildTradeContractTarget(20)).toBe(230);
    expect(guildTradeContractTarget(999)).toBe(230);
  });

  it("시설 보상 보너스를 길드 골드·명성에 같은 비율로 적용한다", () => {
    expect(guildTradeCompletionReward(0)).toEqual({
      gold: 1_500_000,
      fame: 100,
    });
    expect(guildTradeCompletionReward(40)).toEqual({
      gold: 2_100_000,
      fame: 140,
    });
  });

  it("교역소 토큰 보너스의 소수점은 개인 주간 누적 점수로 이월한다", () => {
    expect(guildTradeTokenReward(0, 1, 50)).toBe(1);
    expect(guildTradeTokenReward(1, 1, 50)).toBe(2);
    expect(guildTradeTokenReward(0, 8, 200)).toBe(24);
  });

  it("교역 상점은 시설 1~5레벨에 걸쳐 순차 해금된다", () => {
    expect(
      new Set(GUILD_TRADE_SHOP_ITEMS.map((item) => item.minFacilityLevel)),
    ).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });

  it("교역 상점은 늘어난 주간 재고와 길드 공용 교환품을 제공한다", () => {
    expect(
      GUILD_TRADE_SHOP_ITEMS.slice(0, 8).map(({ id, weeklyLimit }) => [id, weeklyLimit]),
    ).toEqual([
      ["refined_iron", 7],
      ["stamina_potion", 3],
      ["mastery_certificate", 6],
      ["mithril_shard", 3],
      ["sunstone", 2],
      ["settlement_supplies", 3],
      ["trade_support_fund", 2],
      ["guild_fame_document", 2],
    ]);
    expect(
      GUILD_TRADE_SHOP_ITEMS.filter((item) => item.target === "guild").map(
        (item) => item.id,
      ),
    ).toEqual([
      "settlement_supplies",
      "trade_support_fund",
      "guild_fame_document",
      "grand_fame_document",
      "advanced_facility_supplies",
    ]);
    expect(ASSOCIATION_TRADE_SHOP_ITEMS.map((item) => item.id)).toEqual([
      "refined_iron",
      "stamina_potion",
      "mastery_certificate",
      "mithril_shard",
      "sunstone",
    ]);
    expect(associationTradeShopItem("settlement_supplies")).toBeNull();

    const support = GUILD_TRADE_SHOP_ITEMS.find(
      (item) => item.id === "settlement_supplies",
    );
    expect(support).toMatchObject({
      id: "settlement_supplies",
      name: "길드 시설 지원 물자",
      tokenCost: 120,
      weeklyLimit: 3,
      minFacilityLevel: 1,
      target: "guild",
      output: { kind: "guild_facility_support", count: 200 },
    });
    expect(support?.description).toContain("통나무·철광석");
    expect(support?.description).toContain("총 200개");
  });

  it("같은 길드에서는 증표를 보존하되 주차가 바뀌면 주간 기록만 초기화한다", () => {
    const state = parseGuildTradeUserState(
      {
        guildId: 7,
        weekKey: "2026-07-06",
        tokens: 55,
        contributionPoints: 90,
        purchases: { refined_iron: 2 },
      },
      { guildId: 7, weekKey: "2026-07-13" },
    );
    expect(state).toMatchObject({
      tokens: 55,
      contributionPoints: 0,
      purchases: {},
    });
  });

  it("길드를 옮겨도 같은 주의 개인 납품 점수는 이어받는다", () => {
    expect(
      parseGuildTradeUserState(
        {
          guildId: 3,
          weekKey: "2026-07-13",
          tokens: 55,
          contributionPoints: 90,
          purchases: { refined_iron: 2 },
        },
        { guildId: 7, weekKey: "2026-07-13" },
      ),
    ).toMatchObject({
      guildId: 7,
      tokens: 0,
      contributionPoints: 90,
      purchases: {},
    });
  });

  it("주간 개인 납품 점수는 소속과 관계없이 같은 주 기록만 읽는다", () => {
    expect(
      guildTradeWeeklyContributionPoints(
        { guildId: 0, weekKey: "2026-07-13", contributionPoints: 40 },
        "2026-07-13",
      ),
    ).toBe(40);
    expect(
      guildTradeWeeklyContributionPoints(
        { guildId: 3, weekKey: "2026-07-06", contributionPoints: 40 },
        "2026-07-13",
      ),
    ).toBe(0);
    expect(guildTradeWeeklyContributionPoints(null, "2026-07-13")).toBe(0);
  });

  it("길드를 옮기면 이전 길드에서 모은 증표도 초기화한다", () => {
    expect(
      parseGuildTradeUserState(
        { guildId: 3, weekKey: "2026-07-13", tokens: 55 },
        { guildId: 7, weekKey: "2026-07-13" },
      ).tokens,
    ).toBe(0);
  });
});

describe("교역소 Lv.6~10 교환 품목", () => {
  it("품목 정의", async () => {
    const { GUILD_TRADE_SHOP_ITEMS } = await import("./guildTrade");
    const { SUMMON_SCROLL_MATERIAL_ID } = await import("./coopBosses");
    const { TORN_MAP_FRAGMENT_MATERIAL_ID } = await import("./scavengedCrafting");
    const { ENHANCE_STONE_MATERIAL_ID } = await import("./v2Enhance");
    const byId = Object.fromEntries(GUILD_TRADE_SHOP_ITEMS.map((i) => [i.id, i]));
    expect(byId.summon_scroll_bundle).toMatchObject({
      minFacilityLevel: 6, tokenCost: 150, weeklyLimit: 2, target: "members",
      output: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 },
    });
    expect(byId.map_fragment_bundle).toMatchObject({
      minFacilityLevel: 7, tokenCost: 180, weeklyLimit: 1, target: "members",
      output: { kind: "material", materialId: TORN_MAP_FRAGMENT_MATERIAL_ID, count: 1 },
    });
    expect(byId.grand_fame_document).toMatchObject({
      minFacilityLevel: 8, tokenCost: 400, weeklyLimit: 2, target: "guild",
      output: { kind: "guild_fame", count: 300 },
    });
    expect(byId.blue_stone_supply).toMatchObject({
      minFacilityLevel: 9, tokenCost: 350, weeklyLimit: 1, target: "members",
      output: { kind: "material", materialId: ENHANCE_STONE_MATERIAL_ID.blue, count: 1 },
    });
    expect(byId.advanced_facility_supplies).toMatchObject({
      minFacilityLevel: 10, tokenCost: 300, weeklyLimit: 2, target: "guild",
      output: { kind: "guild_facility_support", count: 200, supportKind: "advanced" },
    });
  });
});

describe("교역소 Lv.7 이상 계약 수", () => {
  it("6건·7건 계약을 서로 다른 품목으로 만든다", async () => {
    const { guildTradeItemsForWeek, GUILD_TRADE_ITEMS } = await import("./guildTrade");
    const { tradePostUpgradeForLevel } = await import("./settlement");
    for (const level of [7, 10]) {
      const count = tradePostUpgradeForLevel(level).weeklyContractCount;
      for (const guildId of [1, 7, 23, 99]) {
        const picked = guildTradeItemsForWeek("2026-10-12", guildId, count);
        expect(picked).toHaveLength(count);
        expect(new Set(picked.map((item) => item.id)).size).toBe(count);
        expect(picked.slice(4).every((item) => item.pointValue >= 2)).toBe(true);
      }
    }
    expect(GUILD_TRADE_ITEMS.length).toBeGreaterThan(7);
  });
});
