import { describe, expect, it } from "vitest";
import {
  emptyFishingStock,
  fishingCatchItemDailyProgress,
  parseFishingCatchItemDailyProgress,
  parseFishingStock,
  replaceFishingCatchItemDailyProgress,
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

  it.each([
    [1, 0.249, true],
    [1, 0.25, false],
    [30, 0.399, true],
    [30, 0.4, false],
    [50, 0.399, true],
    [50, 0.4, false],
    [100, 0.399, true],
    [100, 0.4, false],
  ] as const)(
    "낚시 Lv.%i의 어획물 획득 경계를 레벨 비례 확률로 판정한다",
    (fishingLevel, roll, awarded) => {
      const result = rollFishingCatchToStock(
        emptyFishingStock(),
        "rare",
        "2026-07-16",
        () => roll,
        fishingLevel,
      );

      expect(result.awarded).toBe(awarded);
      expect(result.reason).toBe(awarded ? "awarded" : "roll_miss");
    },
  );

  it("낮은 등급 한도가 차도 높은 등급은 자체 한도까지 독립 지급한다", () => {
    const stock = parseFishingStock({
      items: { catch_common: 50, catch_legendary: 2 },
      daily: {
        date: "2026-07-16",
        awarded: { catch_common: 50, catch_legendary: 2 },
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
      balance: 3,
      dailyAwarded: 3,
      dailyCap: 3,
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
    expect(result).toMatchObject({ awarded: true, dailyAwarded: 1, dailyCap: 10 });
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

  it("오늘 어획물 5종의 획득량과 일일 최대치를 고정 순서로 만든다", () => {
    const progress = fishingCatchItemDailyProgress(
      {
        version: 1,
        items: {},
        daily: {
          date: "2026-08-25",
          awarded: { catch_common: 12, catch_special: 8 },
        },
      },
      "2026-08-25",
    );

    expect(
      progress.map(({ itemId, awarded, cap }) => ({ itemId, awarded, cap })),
    ).toEqual([
      { itemId: "catch_common", awarded: 12, cap: 50 },
      { itemId: "catch_fresh", awarded: 0, cap: 35 },
      { itemId: "catch_quality", awarded: 0, cap: 25 },
      { itemId: "catch_special", awarded: 8, cap: 10 },
      { itemId: "catch_legendary", awarded: 0, cap: 3 },
    ]);
  });

  it("이전 날짜의 획득량은 오늘 진행량에 포함하지 않는다", () => {
    const progress = fishingCatchItemDailyProgress(
      {
        version: 1,
        items: {},
        daily: {
          date: "2026-08-24",
          awarded: { catch_common: 40 },
        },
      },
      "2026-08-25",
    );

    expect(progress.every((row) => row.awarded === 0)).toBe(true);
  });

  it("API 진행 목록에서 알려진 어획물의 유효한 값만 정규화한다", () => {
    expect(
      parseFishingCatchItemDailyProgress([
        {
          itemId: "catch_common",
          name: "조작된 이름",
          awarded: 7.9,
          cap: 40,
        },
        {
          itemId: "unknown",
          name: "알 수 없음",
          awarded: 2,
          cap: 3,
        },
        {
          itemId: "catch_fresh",
          name: "신선한 어획물",
          awarded: 3,
          cap: 0,
        },
        {
          itemId: "catch_quality",
          name: "고급 어획물",
          awarded: "3",
          cap: 20,
        },
        {
          itemId: "catch_special",
          name: "특급 어획물",
          awarded: 1,
          cap: 0.5,
        },
      ]),
    ).toEqual([
      {
        itemId: "catch_common",
        name: "일반 어획물",
        awarded: 7,
        cap: 40,
      },
    ]);
  });

  it("챔질 응답으로 해당 등급 진행량만 교체한다", () => {
    const rows = fishingCatchItemDailyProgress(
      emptyFishingStock(),
      "2026-08-25",
    );

    const next = replaceFishingCatchItemDailyProgress(rows, {
      itemId: "catch_special",
      name: "조작된 이름",
      awarded: 8,
      cap: 8,
    });

    expect(next.find((row) => row.itemId === "catch_special")).toEqual({
      itemId: "catch_special",
      name: "특급 어획물",
      awarded: 8,
      cap: 8,
    });
    expect(next.find((row) => row.itemId === "catch_common")?.awarded).toBe(0);
  });
});
