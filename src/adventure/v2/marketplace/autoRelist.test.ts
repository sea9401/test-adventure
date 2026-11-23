import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_AUTO_RELIST_CUT_PCT,
  MARKETPLACE_AUTO_RELIST_TIMES,
  marketplaceAutoRelistPrice,
} from "./autoRelist";

describe("유찰 시 자동 인하 재등록 가격", () => {
  it("30% 낮춰 한 번만 다시 올린다", () => {
    expect(MARKETPLACE_AUTO_RELIST_CUT_PCT).toBe(30);
    expect(MARKETPLACE_AUTO_RELIST_TIMES).toBe(1);
    expect(marketplaceAutoRelistPrice(10_000)).toBe(7_000);
    expect(marketplaceAutoRelistPrice(999)).toBe(699);
  });

  it("낮출 수 없는 가격은 다시 올리지 않는다", () => {
    expect(marketplaceAutoRelistPrice(2)).toBe(1);
    expect(marketplaceAutoRelistPrice(1)).toBeNull();
    expect(marketplaceAutoRelistPrice(0)).toBeNull();
    expect(marketplaceAutoRelistPrice(Number.NaN)).toBeNull();
  });
});
