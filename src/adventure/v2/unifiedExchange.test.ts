import { describe, expect, it } from "vitest";
import {
  normalizeUnifiedExchangeShopId,
  unifiedExchangeShops,
} from "./unifiedExchange";

describe("통합 교환소 상점 목록", () => {
  it("기본 콘텐츠 상점은 모두 포함하고 비밀 상점은 노출하지 않는다", () => {
    const shops = unifiedExchangeShops({ honorOpen: false, museunOpen: false });
    expect(shops.map((shop) => shop.id)).toEqual([
      "general",
      "farm",
      "fishing",
      "arena",
      "coop",
      "guild",
    ]);
    expect(shops.map((shop) => shop.id)).not.toContain("secret");
  });

  it("기능이 열린 특수 상점만 조건부로 추가한다", () => {
    expect(
      unifiedExchangeShops({ honorOpen: true, museunOpen: true }).map(
        (shop) => shop.id,
      ),
    ).toEqual([
      "general",
      "farm",
      "fishing",
      "arena",
      "coop",
      "guild",
      "honor",
      "museun",
    ]);
  });

  it("없거나 비활성화된 상점 요청은 일반 상점으로 돌린다", () => {
    const shops = unifiedExchangeShops({ honorOpen: false, museunOpen: false });
    expect(normalizeUnifiedExchangeShopId("fishing", shops)).toBe("fishing");
    expect(normalizeUnifiedExchangeShopId("honor", shops)).toBe("general");
    expect(normalizeUnifiedExchangeShopId("secret", shops)).toBe("general");
    expect(normalizeUnifiedExchangeShopId(null, shops)).toBe("general");
  });
});
