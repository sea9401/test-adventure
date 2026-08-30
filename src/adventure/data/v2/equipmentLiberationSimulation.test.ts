import { describe, expect, it } from "vitest";
import { simulateEquipmentLiberation } from "./equipmentLiberationSimulation";

describe("simulateEquipmentLiberation", () => {
  it("같은 seed의 100,000회 결과를 byte-identical하게 재현한다", () => {
    const input = { seed: 20_260_829, iterations: 100_000 };
    const first = simulateEquipmentLiberation(input);
    const second = simulateEquipmentLiberation(input);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.seed).toBe(input.seed);
    expect(first.iterations).toBe(input.iterations);
    expect(first.validation.warnings).toEqual([]);
  });

  it("줄 수·승급·단계 레벨·부위별 첫 줄이 이론 확률 허용 범위에 든다", () => {
    const summary = simulateEquipmentLiberation({
      seed: 20_260_829,
      iterations: 100_000,
    });

    expect(summary.initialLineCounts[1].theoreticalPct).toBe(50);
    expect(summary.initialLineCounts[2].theoreticalPct).toBe(35);
    expect(summary.initialLineCounts[3].theoreticalPct).toBe(15);
    expect(Object.values(summary.initialLineCounts).every((row) => row.passed)).toBe(true);

    expect(summary.promotions.rank3To2.theoreticalPct).toBe(5);
    expect(summary.promotions.rank2To1.theoreticalPct).toBe(1);
    expect(summary.promotions.rank3To2.passed).toBe(true);
    expect(summary.promotions.rank2To1.passed).toBe(true);
    expect(summary.promotions.averageAttemptsRank3To2).toBeGreaterThan(18);
    expect(summary.promotions.averageAttemptsRank3To2).toBeLessThan(22);
    expect(summary.promotions.averageAttemptsRank2To1).toBeGreaterThan(90);
    expect(summary.promotions.averageAttemptsRank2To1).toBeLessThan(110);
    expect(summary.promotions.averageGoldToRank1).toBeGreaterThan(1_650_000_000);
    expect(summary.promotions.averageGoldToRank1).toBeLessThan(1_950_000_000);

    for (const rank of [1, 2, 3] as const) {
      expect(Object.values(summary.rankLevelDistributions[rank]).every((row) => row.passed)).toBe(true);
    }
    for (const slotRows of Object.values(summary.firstLineOptions)) {
      expect(Object.values(slotRows).every((row) => row.passed)).toBe(true);
    }
  });

  it("대표 조합과 네 전투 유형을 보고하고 엔진 축 이중 적용 경고가 없다", () => {
    const summary = simulateEquipmentLiberation({
      seed: 20_260_829,
      iterations: 100_000,
    });

    expect(Object.keys(summary.representativeCombinations)).toEqual(["1", "2", "3"]);
    expect(summary.representativeCombinations[3].coreAndRare.observedPct).toBeGreaterThan(0);
    expect(summary.representativeCombinations[3].rareAndChase.observedPct).toBeGreaterThan(0);

    expect(summary.combat.map((row) => row.archetype)).toEqual([
      "physical_low_defense",
      "magic_high_defense",
      "critical_evasion",
      "tanking",
    ]);
    for (const row of summary.combat) {
      expect(row.settings.none.primaryDamageIndex).toBe(100);
      expect(row.settings.topRank1.primaryDamageIndex).toBeGreaterThan(100);
      expect(row.settings.topRank1.physicalEhpIndex).toBeGreaterThan(100);
      expect(row.settings.topRank1.magicEhpIndex).toBeGreaterThan(100);
    }
    expect(summary.validation.doubleApplicationWarnings).toEqual([]);
  });
});
