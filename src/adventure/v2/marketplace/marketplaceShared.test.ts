import { describe, expect, it } from "vitest";
import {
  marketplacePricePosition,
  marketplaceStackQuote,
  groupMarketplaceStackListings,
  priceStatForQuantity,
  type Listing,
} from "./marketplaceShared";

const stat = { n: 12, avg: 100_000, min: 70_000, max: 140_000 };

describe("marketplacePricePosition", () => {
  it("평균보다 5% 이상 낮은 매물을 저렴한 매물로 표시한다", () => {
    expect(marketplacePricePosition(80_000, stat)).toEqual({
      tone: "deal",
      label: "평균보다 20% 저렴",
    });
  });

  it("평균 오차 5% 미만은 시세 수준으로 표시한다", () => {
    expect(marketplacePricePosition(104_000, stat)).toEqual({
      tone: "fair",
      label: "시세 수준",
    });
  });

  it("평균보다 5% 이상 높은 매물에는 평가 태그를 표시하지 않는다", () => {
    expect(marketplacePricePosition(125_000, stat)).toBeNull();
  });

  it("유효한 거래 통계가 없으면 표시하지 않는다", () => {
    expect(marketplacePricePosition(100_000)).toBeNull();
    expect(
      marketplacePricePosition(100_000, { n: 0, avg: 0, min: 0, max: 0 }),
    ).toBeNull();
  });
});

const stackListing = (
  id: number,
  quantity: number,
  price: number,
): Listing => ({
  id,
  isMine: false,
  isHighestBidder: false,
  kind: "material",
  itemId: "ore",
  itemName: "광석",
  quantity,
  price,
  instancePayload: null,
  createdAt: `2026-08-03T00:00:0${id}Z`,
  bidEndsAt: "2026-08-03T00:00:00Z",
  expiresAt: "2026-08-04T00:00:00Z",
  highestBid: null,
  bidCount: 0,
  bidResolvedAt: null,
  nextBid: 1,
});

describe("스택 매물 통합·견적", () => {
  it("같은 품목의 총수량과 최저 개당 가격을 묶는다", () => {
    const [group] = groupMarketplaceStackListings([
      stackListing(1, 10, 1_000),
      stackListing(2, 5, 400),
    ]);
    expect(group).toMatchObject({
      key: "material:ore",
      totalQuantity: 15,
      minUnitPrice: 80,
    });
  });

  it("개당 가격이 낮은 매물부터 원하는 수량의 총액을 계산한다", () => {
    expect(
      marketplaceStackQuote(
        [stackListing(1, 10, 1_000), stackListing(2, 5, 400)],
        8,
      ),
    ).toBe(700);
  });

  it("수량이 부족하면 견적을 만들지 않는다", () => {
    expect(marketplaceStackQuote([stackListing(1, 3, 300)], 4)).toBeNull();
  });
});

describe("priceStatForQuantity", () => {
  it("개당 시세를 선택한 판매 수량의 총액 시세로 환산한다", () => {
    expect(
      priceStatForQuantity(
        {
          ...stat,
          unitAvg: 10_000,
          unitMin: 7_000,
          unitMax: 14_000,
        },
        5,
      ),
    ).toMatchObject({ avg: 50_000, min: 35_000, max: 70_000 });
  });

  it("개당 통계가 없는 옛 응답은 기존 총액 통계를 유지한다", () => {
    expect(priceStatForQuantity(stat, 5)).toBe(stat);
  });
});
