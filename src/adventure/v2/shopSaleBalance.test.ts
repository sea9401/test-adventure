import { describe, expect, it } from "vitest";
import { shopSaleBalancePatch, shopSaleBankNotice } from "./shopSaleBalance";

describe("shopSaleBalancePatch", () => {
  it("판매 응답의 소지금과 은행 잔액만 전역 자원 패치로 만든다", () => {
    expect(shopSaleBalancePatch({ gold: 100, bankedGold: 29_360 })).toEqual({
      gold: 100,
      bankedGold: 29_360,
    });
    expect(
      shopSaleBalancePatch({ gold: Number.NaN, bankedGold: "29360" }),
    ).toEqual({});
  });
});

describe("shopSaleBankNotice", () => {
  it("판매 대금이 은행에 적립됐음을 금액과 함께 알린다", () => {
    expect(shopSaleBankNotice("별노래 활", 29_160)).toBe(
      "✓ 별노래 활 판매 (은행 +29,160골드)",
    );
  });
});
