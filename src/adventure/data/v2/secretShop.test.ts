import { describe, expect, it } from "vitest";
import { SECRET_SHOP_ITEM_BY_ID, SECRET_SHOP_STOCK } from "./secretShop";

describe("secret shop stock", () => {
  it("한계의 비약을 판매하거나 직접 구매 가능한 품목으로 노출하지 않음", () => {
    expect(SECRET_SHOP_STOCK.map((item) => item.id)).toEqual([
      "stone_red",
      "stone_blue",
      "hp_charge_pack",
      "mp_charge_pack",
      "stamina_potion",
    ]);
    expect(SECRET_SHOP_ITEM_BY_ID.has("stamina_cap_tonic")).toBe(false);
  });
});
