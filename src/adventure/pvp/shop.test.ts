import { describe, it, expect } from "vitest";
import { PVP_SHOP_TITLES, pvpShopPriceFor, pvpShopEntries } from "./shop";
import { TITLES } from "../data/titles";

describe("PvP 상점 카탈로그 정합성", () => {
  it("모든 카탈로그 titleId 가 TITLES 에 존재 + category 'pvp'", () => {
    for (const t of PVP_SHOP_TITLES) {
      const def = TITLES[t.titleId];
      expect(def, `TITLES 에 ${t.titleId} 없음`).toBeDefined();
      expect(def.category).toBe("pvp");
    }
  });
  it("가격은 양수 + 오름차순", () => {
    const prices = PVP_SHOP_TITLES.map((t) => t.price);
    for (const p of prices) expect(p).toBeGreaterThan(0);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });
  it("pvpShopPriceFor — 등재 id 는 가격, 미등재는 undefined", () => {
    expect(pvpShopPriceFor("pvp_gladiator")).toBe(200);
    expect(pvpShopPriceFor("first_blood")).toBeUndefined(); // 비상점 칭호
    expect(pvpShopPriceFor("nope")).toBeUndefined();
  });
  it("pvpShopEntries — name/description 가 TITLES 와 일치", () => {
    const entries = pvpShopEntries();
    expect(entries).toHaveLength(PVP_SHOP_TITLES.length);
    for (const e of entries) {
      expect(e.name).toBe(TITLES[e.titleId].name);
      expect(e.description).toBe(TITLES[e.titleId].description);
    }
  });
});
