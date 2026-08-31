import { describe, expect, it } from "vitest";
import {
  buildMarketplaceTradeReportSource,
  type MarketplaceTradeReportRow,
} from "./marketplaceTradeReport";

const soldRow: MarketplaceTradeReportRow = {
  id: 42,
  sellerId: "seller",
  sellerName: "판매자",
  buyerId: "buyer",
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  quantity: 5,
  price: 500,
  instancePayload: null,
  status: "sold",
  closedAt: new Date("2026-08-17T01:00:00.000Z"),
  highestBid: null,
  bidCount: 0,
  bidResolvedAt: null,
};

describe("거래소 체결 신고 원본", () => {
  it("판매자가 신고하면 구매자를 주 대상으로 삼고 양쪽 계정을 보존한다", () => {
    const result = buildMarketplaceTradeReportSource(
      soldRow,
      "seller",
      "구매자",
    );

    expect(result).toMatchObject({
      sourceType: "marketplace_trade",
      sourceId: "42",
      targetUserId: "buyer",
      targetName: "구매자",
      relatedAccounts: [
        { userId: "seller", name: "판매자" },
        { userId: "buyer", name: "구매자" },
      ],
    });
    expect(result?.contentSnapshot).toContain("개당 가격: 100 G");
    expect(result?.contextSnapshot).toMatchObject({
      seller: { userId: "seller", name: "판매자" },
      buyer: { userId: "buyer", name: "구매자" },
    });
  });

  it("구매자와 제3자가 신고하면 판매자를 주 대상으로 삼는다", () => {
    expect(
      buildMarketplaceTradeReportSource(soldRow, "buyer", "구매자")
        ?.targetUserId,
    ).toBe("seller");
    expect(
      buildMarketplaceTradeReportSource(soldRow, "observer", "구매자")
        ?.targetUserId,
    ).toBe("seller");
  });

  it("완료되지 않았거나 체결 시각이 없는 거래는 증거로 인정하지 않는다", () => {
    expect(
      buildMarketplaceTradeReportSource(
        { ...soldRow, status: "active" },
        "observer",
        "구매자",
      ),
    ).toBeNull();
    expect(
      buildMarketplaceTradeReportSource(
        { ...soldRow, closedAt: null },
        "observer",
        "구매자",
      ),
    ).toBeNull();
  });

  it("반대편 계정이 사라진 판매자는 자기 자신을 신고할 수 없다", () => {
    expect(
      buildMarketplaceTradeReportSource(
        { ...soldRow, buyerId: null },
        "seller",
        null,
      ),
    ).toBeNull();
  });
});
