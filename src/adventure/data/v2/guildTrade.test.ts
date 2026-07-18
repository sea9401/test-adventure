import { describe, expect, it } from "vitest";
import {
  GUILD_TRADE_ITEMS,
  GUILD_TRADE_SHOP_ITEMS,
  guildTradeCompletionReward,
  guildTradeContractTarget,
  guildTradeItemsForWeek,
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

  it("계약 수는 1~5 범위로 보정한다", () => {
    expect(guildTradeItemsForWeek("2026-07-13", 7, 0)).toHaveLength(1);
    expect(guildTradeItemsForWeek("2026-07-13", 7, 99)).toHaveLength(5);
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

  it("교역 상점은 시설 1~5레벨에 걸쳐 순차 해금된다", () => {
    expect(GUILD_TRADE_SHOP_ITEMS.map((item) => item.minFacilityLevel)).toEqual([
      1, 2, 3, 4, 5,
    ]);
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

  it("길드를 옮기면 이전 길드에서 모은 증표도 초기화한다", () => {
    expect(
      parseGuildTradeUserState(
        { guildId: 3, weekKey: "2026-07-13", tokens: 55 },
        { guildId: 7, weekKey: "2026-07-13" },
      ).tokens,
    ).toBe(0);
  });
});
