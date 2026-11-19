import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_FAVORITES_KEY,
  equipmentFavoriteKey,
  marketplaceFavoriteKey,
} from "./marketplaceFavorites";

describe("거래소 즐겨찾기 키", () => {
  it("기존 브라우저 저장 키를 그대로 쓴다", () => {
    expect(MARKETPLACE_FAVORITES_KEY).toBe("adventure.marketplace.favorites.v1");
  });

  it("매물 종류와 품목 id를 이어 붙인다", () => {
    expect(marketplaceFavoriteKey("material", "iron_ore")).toBe("material:iron_ore");
  });

  it("장비 도감에서 단 별표는 거래소 장비 매물과 같은 키가 된다", () => {
    expect(equipmentFavoriteKey("iron_sword")).toBe(
      marketplaceFavoriteKey("equip", "iron_sword"),
    );
  });
});
