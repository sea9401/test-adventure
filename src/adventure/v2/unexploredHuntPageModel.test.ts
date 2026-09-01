import { describe, expect, it } from "vitest";
import { unexploredSnapshotToHuntSummary } from "./unexploredHuntPageModel";

describe("미개척지 전투 화면 모델", () => {
  it("API 스냅샷의 서버 계산값을 전투 요약으로 그대로 옮긴다", () => {
    const summary = unexploredSnapshotToHuntSummary({
      level: 100,
      eligible: true,
      earnedPoints: 12,
      spentPoints: 4,
      explorationXp: 300,
      xpPoints: 4,
      nextPointCost: 500,
      nextPointRemaining: 200,
      selectedNodeIds: ["start"],
      difficulty: 105,
      difficultyIncrease: 10,
      encounterShares: [
        { kind: "base", share: 60 },
        { kind: "pool", poolId: "iron_legion", share: 40 },
      ],
      rewardSummary: {
        gold: 10,
        baseMaterial: 20,
        equipment: 30,
        quality: 5,
        specialMaterial: 40,
        rare: 1,
        rareCopyChancePct: 15,
        traceExtraChancePct: 10,
        basePoolRewardPct: 0,
        conversion: null,
      },
      effects: { traceEnabled: true },
      traces: { iron_legion: 7 },
      gold: 0,
      bankedGold: 0,
      materials: {},
      achievementIds: [],
      refundGoldCost: 75_000,
      summonStoneCraftCost: {
        baseGoldCost: 1_000_000,
        goldCost: 1_000_000,
        liberationDiscountPct: 0,
      },
    });

    expect(summary).toEqual({
      difficulty: 105,
      encounterShares: [
        { kind: "base", share: 60 },
        { kind: "pool", poolId: "iron_legion", share: 40 },
      ],
      rewardPct: {
        gold: 10,
        baseMaterial: 20,
        equipment: 30,
        quality: 5,
        specialMaterial: 40,
        rare: 1,
      },
      rareCopyChancePct: 15,
      traceEnabled: true,
      traceExtraChancePct: 10,
    });
  });
});
