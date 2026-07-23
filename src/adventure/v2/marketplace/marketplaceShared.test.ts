import { describe, expect, it } from "vitest";
import { marketplacePricePosition } from "./marketplaceShared";

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
