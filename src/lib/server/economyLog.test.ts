import { describe, expect, it } from "vitest";
import { buildLargeGoldMovementSignal } from "./economyLog";

describe("large gold movement signal", () => {
  it("거래 웹훅 집계를 위한 아이템·주문·총액 메타데이터를 보존한다", () => {
    expect(
      buildLargeGoldMovementSignal(
        {
          userId: "seller-user-123456",
          counterpartyUserId: "buyer-user-123456",
          eventType: "marketplace.buy_order.sell",
          goldDelta: 98_828_500,
          itemKind: "material",
          itemId: "v2_stamina_shard",
          quantity: 206,
          detail: {
            itemName: "활력의 파편",
            orderId: 54,
            listingId: 1918,
            grossGold: 104_030_000,
            taxRate: 0.05,
          },
        },
        new Date("2026-08-13T12:19:57.000Z"),
      ),
    ).toMatchObject({
      key: "economy:large-gold-delta",
      threshold: 3,
      windowMs: 600_000,
      detail: { channel: "economy" },
      sample: {
        occurredAt: "2026-08-13T12:19:57.000Z",
        eventType: "marketplace.buy_order.sell",
        goldDelta: 98_828_500,
        userId: "seller-user-123456",
        counterpartyUserId: "buyer-user-123456",
        itemKind: "material",
        itemId: "v2_stamina_shard",
        itemName: "활력의 파편",
        quantity: 206,
        orderId: 54,
        listingId: 1918,
        grossGold: 104_030_000,
        taxRate: 0.05,
      },
    });
  });

  it("기준 미만 골드 변동은 신호를 만들지 않는다", () => {
    expect(
      buildLargeGoldMovementSignal({
        eventType: "marketplace.buy",
        goldDelta: -19_999_999,
      }),
    ).toBeNull();
  });

  it("기존 거래 로그에 이름이 없어도 카탈로그의 한글 아이템 이름을 사용한다", () => {
    expect(
      buildLargeGoldMovementSignal({
        userId: "buyer-user-123456",
        counterpartyUserId: "seller-user-123456",
        eventType: "marketplace.buy",
        goldDelta: -70_000_000,
        itemKind: "equip",
        itemId: "v2_storm_breaker_greatsword",
        quantity: 1,
        detail: { listingId: 1919 },
      })?.sample,
    ).toMatchObject({ itemName: "붕괴선봉 대검" });
  });
});
