import { describe, expect, it } from "vitest";
import {
  buildAccountEconomyTrace,
  parseEconomyTraceDays,
} from "./accountEconomyTrace";

describe("계정 재화 흐름 분석", () => {
  it("조회 기간은 7·30·90일만 허용한다", () => {
    expect(parseEconomyTraceDays(null)).toBe(30);
    expect(parseEconomyTraceDays("7")).toBe(7);
    expect(parseEconomyTraceDays("30")).toBe(30);
    expect(parseEconomyTraceDays("90")).toBe(90);
    expect(parseEconomyTraceDays("14")).toBeNull();
  });

  it("생산·현재 재고·거래 상대·본인 길드 창고 이동을 한 보고서로 만든다", () => {
    const report = buildAccountEconomyTrace({
      account: {
        userId: "user-1",
        gameName: "흑우",
        guildId: 1,
        guildName: "네오",
        guildRole: "member",
      },
      days: 30,
      since: "2026-07-13T00:00:00.000Z",
      until: "2026-08-12T00:00:00.000Z",
      gatheringRows: [
        {
          eventType: "life.woodcutting.gather",
          itemKind: "material",
          itemId: "v2_timber",
          itemName: "소나무 원목",
          quantity: 120,
          events: 80,
        },
        {
          eventType: "life.mining.gather",
          itemKind: "material",
          itemId: "v2_iron_ore",
          itemName: "철광석",
          quantity: 70,
          events: 50,
        },
      ],
      economyRows: [
        {
          eventType: "sink.guild_workshop.craft_fee",
          itemKind: "equipment",
          itemId: "v2_crafted_blade",
          quantity: 3,
          goldDelta: -30_000,
          events: 3,
        },
      ],
      counterpartyRows: [
        {
          eventType: "marketplace.sell",
          itemKind: "material",
          itemId: "v2_timber",
          quantity: 20,
          goldDelta: 9_500,
          events: 1,
          counterpartyUserId: "buyer-1",
          counterpartyName: "구매자",
        },
      ],
      warehouseRows: [
        {
          type: "warehouse_deposit",
          itemKind: "material",
          itemId: "v2_iron_ore",
          itemName: "철광석",
          quantity: 10,
          events: 1,
        },
      ],
      currentMaterials: {
        v2_timber: 100,
        v2_iron_ore: 60,
        unrelated: 999,
      },
      gold: 25,
      bankedGold: 100_000,
    });

    expect(report.production.activities).toEqual([
      { activity: "woodcutting", quantity: 120, events: 80 },
      { activity: "mining", quantity: 70, events: 50 },
    ]);
    expect(report.current.productionMaterials).toEqual([
      {
        itemKind: "material",
        itemId: "v2_timber",
        itemName: "소나무 원목",
        quantity: 100,
      },
      {
        itemKind: "material",
        itemId: "v2_iron_ore",
        itemName: "철광석",
        quantity: 60,
      },
    ]);
    expect(report.marketplace).toEqual([
      expect.objectContaining({
        direction: "sell",
        counterpartyName: "구매자",
        itemId: "v2_timber",
        quantity: 20,
      }),
    ]);
    expect(report.guildWarehouse).toEqual([
      expect.objectContaining({ direction: "deposit", quantity: 10 }),
    ]);
    expect(report.evidence).toEqual({
      materialMarketplaceTransfer: true,
      guildWarehouseDeposit: true,
    });
    expect(report.uses[0]).toMatchObject({
      eventType: "sink.guild_workshop.craft_fee",
      goldDelta: -30_000,
    });
  });

  it("거래와 길드 이동이 없으면 직접 이전 근거를 만들지 않는다", () => {
    const report = buildAccountEconomyTrace({
      account: {
        userId: "user-2",
        gameName: "보관자",
        guildId: null,
        guildName: null,
        guildRole: null,
      },
      days: 7,
      since: "2026-08-05T00:00:00.000Z",
      until: "2026-08-12T00:00:00.000Z",
      gatheringRows: [],
      economyRows: [],
      counterpartyRows: [],
      warehouseRows: [],
      currentMaterials: {},
      gold: 0,
      bankedGold: 0,
    });

    expect(report.marketplace).toEqual([]);
    expect(report.guildWarehouse).toEqual([]);
    expect(report.evidence).toEqual({
      materialMarketplaceTransfer: false,
      guildWarehouseDeposit: false,
    });
    expect(report.limitations).toContain("개별 일련번호");
  });
});
