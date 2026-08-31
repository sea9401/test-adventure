import { describe, expect, it } from "vitest";
import {
  fixedUnexploredRewardScenarios,
  includedUnexploredRewardValue,
  runFixedUnexploredRewardSimulation,
  simulateUnexploredRewardFixture,
  summarizeStableUnexploredRewards,
  type UnexploredRewardFixture,
} from "./unexploredRewardSimulation";

const FIXTURE: UnexploredRewardFixture = {
  id: "calculation",
  job: "검산용",
  build: "혼합",
  winRate: 0.5,
  winBattleSeconds: 10,
  lossBattleSeconds: 20,
  winStamina: 10,
  lossStamina: 5,
  hpMpChargeOnWin: 2,
  hpMpChargeOnLoss: 3,
  lossTax: 10,
};

describe("미개척지 보상 경제 시뮬레이션", () => {
  it("승패 스태미나와 충전·손실 비용을 반영해 순가치를 계산한다", () => {
    const rolls = [0.1, 0.9];
    const result = simulateUnexploredRewardFixture({
      fixture: FIXTURE,
      rewards: {
        goldFaceValue: 40,
        equipmentNpcSaleValue: 20,
        baseMaterialMedianValue: 15,
        specialMaterialMedianValue: 10,
        rareMaterialMedianValue: 10,
        regularUniqueMedianValue: 5,
        ultraRareUniqueMarketValue: 999_999,
        unusedBossCoreMarketValue: 999_999,
      },
      runs: 2,
      rng: () => rolls.shift() ?? 0,
    });

    expect(result.wins).toBe(1);
    expect(result.netValue).toBe(85);
    expect(result.per100StaminaNet).toBeCloseTo(566.6667, 4);
    expect(result.perHourNet).toBe(10_200);
    expect(result.stable).toBe(false);
  });

  it("0.5% 초희귀 고유와 사용처 없는 우두머리 핵 가치를 제외한다", () => {
    expect(
      includedUnexploredRewardValue({
        goldFaceValue: 40,
        equipmentNpcSaleValue: 20,
        baseMaterialMedianValue: 15,
        specialMaterialMedianValue: 10,
        rareMaterialMedianValue: 10,
        regularUniqueMedianValue: 5,
        ultraRareUniqueMarketValue: 999_999,
        unusedBossCoreMarketValue: 999_999,
      }),
    ).toBe(100);
  });

  it("승률 70% 미만 캐릭터는 안정 파밍 집계에서 제외한다", () => {
    const stable = simulateUnexploredRewardFixture({
      fixture: { ...FIXTURE, id: "stable", winRate: 0.7 },
      rewards: { goldFaceValue: 100 },
      runs: 1,
      rng: () => 0,
    });
    const unstable = simulateUnexploredRewardFixture({
      fixture: { ...FIXTURE, id: "unstable", winRate: 0.699 },
      rewards: { goldFaceValue: 1_000_000 },
      runs: 1,
      rng: () => 0,
    });

    const summary = summarizeStableUnexploredRewards([stable, unstable]);
    expect(summary.stablePlayerCount).toBe(1);
    expect(summary.excludedPlayerCount).toBe(1);
    expect(summary.per100StaminaNet).toBe(stable.per100StaminaNet);
  });

  it("고정 구성에 필수 변형을 포함하고 보상 집중 목표 범위를 지킨다", () => {
    const scenarioIds = fixedUnexploredRewardScenarios().map((row) => row.id);
    expect(scenarioIds).toEqual(
      expect.arrayContaining([
        "base-95",
        "reward-95",
        "reward-100",
        "reward-105",
        "reward-110",
        "reward-115",
        "reward-120",
        "two-pool-focused",
        "three-pool-mixed",
        "conversion-gold",
        "conversion-collector",
        "conversion-armory",
        "focused-trace",
      ]),
    );

    const report = runFixedUnexploredRewardSimulation({
      seed: 20_260_828,
      runs: 10_000,
    });
    for (const row of report.rows.filter((row) => row.targetPct != null)) {
      expect(row.rewardIndexPct).toBeGreaterThanOrEqual(row.targetPct! - 5);
      expect(row.rewardIndexPct).toBeLessThanOrEqual(row.targetPct! + 5);
    }
    expect(report.maxRewardIndexPct).toBeGreaterThanOrEqual(170);
    expect(report.maxRewardIndexPct).toBeLessThanOrEqual(185);
    expect(
      report.rows.find((row) => row.id === "focused-trace")?.rewardIndexPct,
    ).toBeGreaterThanOrEqual(120);
    expect(report.valuationExcludes).toEqual([
      "0.5% 초희귀 고유",
      "미사용 우두머리 핵",
    ]);
  });
});
