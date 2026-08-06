import { describe, expect, it } from "vitest";
import { lifeSummaryFromSaves } from "./lifeSummary";

describe("생활 기록 집계", () => {
  it("랭킹과 같은 다섯 생활 레벨을 숙련도로 합산한다", () => {
    const summary = lifeSummaryFromSaves(
      {
        farmRaw: { stats: { farmingXp: 810 } },
        woodcuttingRaw: { cuts: 10, xp: 3_240 },
        miningRaw: { successes: 10, xp: 3_240 },
        fishingRaw: { xp: 2_835 },
        cookingRaw: { xp: 810 },
      },
      0,
    );

    expect(summary.activities.map((activity) => activity.level)).toEqual([
      10, 10, 10, 10, 10,
    ]);
    expect(summary.lifeMastery).toEqual({ level: 50, maxLevel: 250 });
    expect(summary.artisan.id).toBe("blacksmith");
  });

  it("누적 생활 기록과 대장장이 성장을 함께 정규화한다", () => {
    const summary = lifeSummaryFromSaves(
      {
        farmRaw: {
          stats: {
            farmingXp: 160,
            harvests: 12,
            rareHarvests: 3,
            deliveries: 4,
            reputation: 90,
          },
        },
        woodcuttingRaw: {
          cuts: 8,
          xp: 80,
          perfectCuts: 2,
          timberEarned: 11,
          bestCombo: 5,
        },
        miningRaw: {
          successes: 7,
          xp: 70,
          oreEarned: 9,
          byproductsEarned: 2,
          nodes: { iron_vein: 7 },
        },
        fishingRaw: { xp: 35, catches: 6 },
        fishingCodexRaw: {
          fish: {
            crucian_carp: {
              discovered: true,
              bestSize: 30,
              totalCaught: 2,
            },
          },
        },
        cookingRaw: {
          xp: 40,
          discoveredRecipeIds: ["rustic_bread"],
          stats: {
            dishesCooked: 5,
            ordersCompleted: 2,
            masterpiecesCooked: 1,
          },
        },
        craftingRaw: {
          artisan: { blacksmith: { xp: 650, crafts: 12 } },
          workshopStats: { totalCrafts: 10, qualityCrafts: 4 },
        },
      },
      0,
    );

    expect(summary.activities.find((entry) => entry.id === "farming")?.records)
      .toEqual(expect.arrayContaining([{ label: "총 수확", value: 12, suffix: "회" }]));
    expect(summary.activities.find((entry) => entry.id === "fishing")?.records)
      .toEqual(expect.arrayContaining([{ label: "등록 어종", value: 1, suffix: "/50종" }]));
    expect(summary.artisan).toMatchObject({
      level: 3,
      xp: 650,
      records: [
        { label: "제작", value: 10, suffix: "회" },
        { label: "품질 제작", value: 4, suffix: "회" },
        { label: "숙련 활동", value: 12, suffix: "회" },
      ],
    });
  });

  it("빈 값과 손상된 저장값은 신규 생활 기록으로 안전하게 표시한다", () => {
    const summary = lifeSummaryFromSaves(
      {
        farmRaw: "broken",
        woodcuttingRaw: null,
        miningRaw: [],
        fishingRaw: { xp: -100, catches: "bad" },
        cookingRaw: false,
        craftingRaw: { artisan: { blacksmith: "bad" } },
      },
      0,
    );

    expect(summary.lifeMastery).toEqual({ level: 5, maxLevel: 250 });
    expect(summary.activities.every((activity) => activity.level === 1)).toBe(true);
    expect(summary.artisan).toMatchObject({ level: 1, xp: 0 });
  });
});
