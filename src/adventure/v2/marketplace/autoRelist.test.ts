import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT,
  MARKETPLACE_AUTO_RELIST_TIMES,
  isMarketplaceAutoRelistCutPct,
  marketplaceAutoRelistCutPct,
  marketplaceAutoRelistPrice,
} from "./autoRelist";

describe("유찰 시 자동 인하 재등록 가격", () => {
  it("인하 폭을 정하지 않으면 30%, 한 번만 다시 올린다", () => {
    expect(MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT).toBe(30);
    expect(MARKETPLACE_AUTO_RELIST_TIMES).toBe(1);
    expect(marketplaceAutoRelistPrice(10_000)).toBe(7_000);
    expect(marketplaceAutoRelistPrice(999)).toBe(699);
  });

  it("판매자가 정한 인하 폭을 쓴다", () => {
    expect(marketplaceAutoRelistPrice(10_000, 10)).toBe(9_000);
    expect(marketplaceAutoRelistPrice(10_000, 50)).toBe(5_000);
    expect(marketplaceAutoRelistPrice(10_000, 90)).toBe(1_000);
    expect(marketplaceAutoRelistPrice(10_000, 1)).toBe(9_900);
  });

  it("인하 폭은 1~90의 정수만 받고 그 밖의 값은 기본값으로 읽는다", () => {
    for (const value of [1, 15, 30, 90]) {
      expect(isMarketplaceAutoRelistCutPct(value), String(value)).toBe(true);
    }
    for (const value of [0, 91, 12.5, -5, "30", null, undefined, Number.NaN]) {
      expect(isMarketplaceAutoRelistCutPct(value), String(value)).toBe(false);
    }
    expect(marketplaceAutoRelistCutPct(45)).toBe(45);
    expect(marketplaceAutoRelistCutPct(0)).toBe(30);
    expect(marketplaceAutoRelistPrice(10_000, 0)).toBe(7_000);
  });

  it("낮출 수 없는 가격은 다시 올리지 않는다", () => {
    expect(marketplaceAutoRelistPrice(2)).toBe(1);
    expect(marketplaceAutoRelistPrice(1)).toBeNull();
    expect(marketplaceAutoRelistPrice(0)).toBeNull();
    expect(marketplaceAutoRelistPrice(Number.NaN)).toBeNull();
    // 인하 폭이 작아 값이 그대로면 다시 올리지 않는다.
    expect(marketplaceAutoRelistPrice(50, 1)).toBe(49);
    expect(marketplaceAutoRelistPrice(2, 1)).toBe(1);
  });
});
