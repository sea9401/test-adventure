import { describe, expect, it } from "vitest";
import {
  emptyFishingStock,
  parseFishingStock,
  rollFishingCatchToStock,
  spendFishingCatchItem,
} from "./fishingStock";

describe("fishing stock", () => {
  it("어종 대신 티어별 공동 어획물 한 종류를 적립한다", () => {
    const first = rollFishingCatchToStock(
      emptyFishingStock(),
      "uncommon",
      "2026-07-16",
      () => 0.09,
    );
    const second = rollFishingCatchToStock(
      first.stock,
      "uncommon",
      "2026-07-16",
      () => 0,
    );

    expect(second.item).toMatchObject({
      id: "catch_fresh",
      name: "신선한 어획물",
    });
    expect(second.balance).toBe(2);
    expect(second.stock.items).toEqual({ catch_fresh: 2 });
    expect(second.dailyAwarded).toBe(2);
  });

  it("성공한 낚시도 10% 판정에 실패하면 어획물을 지급하지 않는다", () => {
    const result = rollFishingCatchToStock(
      emptyFishingStock(),
      "rare",
      "2026-07-16",
      () => 0.1,
    );
    expect(result).toMatchObject({
      awarded: false,
      reason: "roll_miss",
      balance: 0,
      dailyAwarded: 0,
    });
    expect(result.stock).toEqual(emptyFishingStock());
  });

  it("낮은 등급 한도가 차도 높은 등급은 자체 한도까지 독립 지급한다", () => {
    const stock = parseFishingStock({
      items: { catch_common: 40, catch_legendary: 1 },
      daily: {
        date: "2026-07-16",
        awarded: { catch_common: 40, catch_legendary: 1 },
      },
    });
    const common = rollFishingCatchToStock(
      stock,
      "common",
      "2026-07-16",
      () => 0,
    );
    const legendary = rollFishingCatchToStock(
      stock,
      "legendary",
      "2026-07-16",
      () => 0,
    );
    expect(common).toMatchObject({ awarded: false, reason: "daily_cap" });
    expect(legendary).toMatchObject({
      awarded: true,
      balance: 2,
      dailyAwarded: 2,
      dailyCap: 2,
    });
  });

  it("KST 일자가 바뀌면 해당 등급 획득 한도를 새로 집계한다", () => {
    const stock = parseFishingStock({
      items: { catch_special: 8 },
      daily: { date: "2026-07-15", awarded: { catch_special: 8 } },
    });
    const result = rollFishingCatchToStock(
      stock,
      "epic",
      "2026-07-16",
      () => 0,
    );
    expect(result).toMatchObject({ awarded: true, dailyAwarded: 1, dailyCap: 8 });
    expect(result.stock.daily).toEqual({
      date: "2026-07-16",
      awarded: { catch_special: 1 },
    });
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
