import { describe, expect, it } from "vitest";
import {
  addFishingCatchToStock,
  emptyFishingStock,
  parseFishingStock,
  spendFishingCatchItem,
} from "./fishingStock";

describe("fishing stock", () => {
  it("어종 대신 티어별 공동 어획물 한 종류를 적립한다", () => {
    const first = addFishingCatchToStock(emptyFishingStock(), "uncommon");
    const second = addFishingCatchToStock(first.stock, "uncommon");

    expect(second.item).toMatchObject({
      id: "catch_fresh",
      name: "신선한 어획물",
    });
    expect(second.balance).toBe(2);
    expect(second.stock.items).toEqual({ catch_fresh: 2 });
  });

  it("알 수 없는 항목과 잘못된 수량은 저장소에서 제거한다", () => {
    expect(
      parseFishingStock({
        items: { catch_common: 7.8, unknown_fish: 99, catch_quality: -3 },
      }),
    ).toEqual({ version: 1, items: { catch_common: 7 } });
  });

  it("보유량 안에서만 어획물을 소비한다", () => {
    const stock = parseFishingStock({ items: { catch_common: 5 } });
    expect(spendFishingCatchItem(stock, "catch_common", 3)?.items).toEqual({
      catch_common: 2,
    });
    expect(spendFishingCatchItem(stock, "catch_common", 6)).toBeNull();
  });
});
