import { describe, it, expect } from "vitest";
import {
  TREASURE_SHOP_TITLES,
  TREASURE_SHOP_CONSUMABLES,
  treasureShopEntries,
  treasureShopPriceFor,
  treasureShopConsumablePriceFor,
} from "./treasureShop";
import { TITLES } from "@/adventure/data/titles";

describe("발굴 코인 상점 카탈로그", () => {
  it("등재 칭호는 전부 titles.ts 에 정의 + category treasure", () => {
    for (const t of TREASURE_SHOP_TITLES) {
      expect(TITLES[t.titleId]).toBeDefined();
      expect(TITLES[t.titleId].category).toBe("treasure");
      expect(t.price).toBeGreaterThan(0);
    }
  });

  it("가격 단조 증가(저가→고가)", () => {
    const prices = TREASURE_SHOP_TITLES.map((t) => t.price);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("priceFor: 등재 가격 / 미등재 undefined", () => {
    expect(treasureShopPriceFor("treasure_digger")).toBe(60);
    expect(treasureShopPriceFor("not_a_title")).toBeUndefined();
  });

  it("entries: 이름·설명·가격 합본", () => {
    const e = treasureShopEntries();
    expect(e.length).toBe(TREASURE_SHOP_TITLES.length);
    expect(e[0]).toMatchObject({
      titleId: "treasure_digger",
      name: TITLES.treasure_digger.name,
      price: 60,
    });
  });
});

describe("발굴 코인 상점 소비품", () => {
  it("등재 소비품은 가격>0 + 이름·설명 보유", () => {
    expect(TREASURE_SHOP_CONSUMABLES.length).toBeGreaterThan(0);
    for (const c of TREASURE_SHOP_CONSUMABLES) {
      expect(c.price).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it("스태미나 회복약 등재 가격 200", () => {
    expect(treasureShopConsumablePriceFor("stamina_potion")).toBe(200);
    expect(treasureShopConsumablePriceFor("not_an_item")).toBeUndefined();
  });
});
