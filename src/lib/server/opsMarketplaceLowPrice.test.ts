import { describe, expect, it } from "vitest";
import {
  EXTREME_LOW_PRICE_RATIO,
  assessExtremeLowMarketplacePrice,
} from "./opsMarketplaceLowPrice";

describe("거래소 비정상 저가 체결 판정", () => {
  const history = [980_000, 1_000_000, 1_010_000, 1_020_000, 1_050_000];

  it("중앙값의 10% 이하인 극단적 저가만 감지한다", () => {
    expect(EXTREME_LOW_PRICE_RATIO).toBe(0.1);
    expect(
      assessExtremeLowMarketplacePrice({
        grossGold: 100_000,
        quantity: 1,
        historicalUnitPrices: history,
      }),
    ).toMatchObject({
      actualUnitPrice: 100_000,
      referenceUnitPrice: 1_010_000,
      priceRatioPct: 9.9,
      referenceSampleCount: 5,
    });
    expect(
      assessExtremeLowMarketplacePrice({
        grossGold: 110_000,
        quantity: 1,
        historicalUnitPrices: history,
      }),
    ).toBeNull();
  });

  it("거래 이력이 부족하면 장비 NPC 판매가를 보조 기준으로 쓴다", () => {
    expect(
      assessExtremeLowMarketplacePrice({
        grossGold: 1,
        quantity: 1,
        historicalUnitPrices: [],
        catalogUnitFloor: 600_000,
      }),
    ).toMatchObject({
      actualUnitPrice: 1,
      referenceUnitPrice: 600_000,
      referenceSampleCount: 0,
    });
  });

  it("정상가 기준 총가치가 10만 골드 미만인 소액 거래는 알림하지 않는다", () => {
    expect(
      assessExtremeLowMarketplacePrice({
        grossGold: 1,
        quantity: 1,
        historicalUnitPrices: [900, 950, 1_000, 1_050, 1_100],
      }),
    ).toBeNull();
  });

  it("이력 5건 미만인 비장비는 평균가가 흔들릴 수 있어 판정하지 않는다", () => {
    expect(
      assessExtremeLowMarketplacePrice({
        grossGold: 1,
        quantity: 1,
        historicalUnitPrices: [1_000_000, 1_100_000, 1_200_000, 1_300_000],
      }),
    ).toBeNull();
  });
});
