import { describe, expect, it } from "vitest";
import {
  SHOP_MAX_QUANTITY,
  clampShopQuantity,
  maxShopQuantity,
  parseShopQuantity,
  staminaPotionPurchaseMessage,
} from "./shopQuantity";

describe("parseShopQuantity", () => {
  it("수량을 보내지 않은 기존 요청은 1개로 처리한다", () => {
    expect(parseShopQuantity(undefined)).toBe(1);
  });

  it("상한 이하의 양의 정수만 받는다", () => {
    expect(parseShopQuantity(30)).toBe(30);
    expect(parseShopQuantity(SHOP_MAX_QUANTITY)).toBe(SHOP_MAX_QUANTITY);
  });

  it.each([0, -1, 1.5, Number.NaN, "30", null, SHOP_MAX_QUANTITY + 1])(
    "%s 는 거부한다",
    (raw) => {
      expect(parseShopQuantity(raw)).toBe(null);
    },
  );
});

describe("maxShopQuantity", () => {
  it("재화·남은 횟수 중 가장 작은 값을 고른다", () => {
    expect(maxShopQuantity(1_000 / 200, 30)).toBe(5);
    expect(maxShopQuantity(100, 7)).toBe(7);
  });

  it("상한을 넘지 않고 음수를 돌려주지 않는다", () => {
    expect(maxShopQuantity(100_000)).toBe(SHOP_MAX_QUANTITY);
    expect(maxShopQuantity(-3, 10)).toBe(0);
  });
});

describe("clampShopQuantity", () => {
  it("구매 후 최대치가 줄면 입력값도 따라 줄인다", () => {
    expect(clampShopQuantity(30, 5)).toBe(5);
    expect(clampShopQuantity(3, 5)).toBe(3);
  });

  it("살 수 없는 상태에서도 1 밑으로 내려가지 않는다", () => {
    expect(clampShopQuantity(3, 0)).toBe(1);
  });
});

describe("staminaPotionPurchaseMessage", () => {
  it("여러 개를 샀을 때만 수량을 적는다", () => {
    expect(staminaPotionPurchaseMessage({ quantity: 30 })).toBe(
      "스태미나 회복약 30개를 구매했다.",
    );
    expect(staminaPotionPurchaseMessage({ quantity: 1 })).toBe(
      "스태미나 회복약을 구매했다.",
    );
    expect(staminaPotionPurchaseMessage({})).toBe(
      "스태미나 회복약을 구매했다.",
    );
  });
});
