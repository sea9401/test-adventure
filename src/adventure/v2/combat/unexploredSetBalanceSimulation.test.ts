import { describe, expect, it } from "vitest";
import {
  SCENARIO_IDS,
  validateUnexploredSpecialtySetSimulation,
  runUnexploredSpecialtySetSimulation,
} from "../../../../scripts/sim-unexplored-specialty-sets";

describe("unexplored specialty set simulation", () => {
  it("비교 대상 9개를 같은 순서로 유지한다", () => {
    expect(SCENARIO_IDS).toEqual([
      "existing_t6_baseline",
      "iron_line_3",
      "triad_decay_3",
      "precision_hunt_3",
      "chain_drive_3",
      "crushing_pressure_3",
      "existing_weapon_3_plus_battle_revenge_3",
      "existing_weapon_3_plus_precision_hunt_3",
      "existing_weapon_3_plus_crushing_pressure_3",
    ]);
  });

  it("같은 seed 설정은 실제 PvE 엔진에서 같은 유한 결과를 만든다", async () => {
    const first = await runUnexploredSpecialtySetSimulation({
      seedCount: 2,
      actionLimit: 300,
    });
    const second = await runUnexploredSpecialtySetSimulation({
      seedCount: 2,
      actionLimit: 300,
    });

    expect(second).toEqual(first);
    expect(first.rows).toHaveLength(9);
    expect(first.rows.every((row) => row.maxActions <= 300)).toBe(true);
    expect(
      first.rows
        .flatMap((row) => Object.values(row.metrics))
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite),
    ).toBe(true);
    expect(first.inertnessPassed).toBe(true);
  });

  it("실제 파생식의 치명 배율·치명 저항과 모든 장비 전투 옵션을 사용한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 1 });

    for (const row of report.rows) {
      expect(row.playerSnapshot.critMult).toBeGreaterThanOrEqual(1.5);
      expect(row.playerSnapshot.critMult).toBeLessThanOrEqual(2.6);
      expect(row.playerSnapshot.critResistPct).toBeGreaterThan(0);
      expect(Object.values(row.playerSnapshot).every(Number.isFinite)).toBe(true);
    }
    expect(
      report.rows.find((row) => row.scenario === "crushing_pressure_3")
        ?.playerSnapshot.critResistPct,
    ).toBeGreaterThan(
      report.rows.find((row) => row.scenario === "existing_t6_baseline")!
        .playerSnapshot.critResistPct,
    );
    expect(
      report.rows.find((row) => row.scenario === "triad_decay_3")!
        .playerSnapshot.statusDamageReductionPct,
    ).toBeGreaterThan(0);
    expect(
      report.rows.find((row) => row.scenario === "precision_hunt_3")!
        .playerSnapshot.basicAttackDamagePct,
    ).toBeGreaterThan(0);
    expect(
      report.rows.find((row) => row.scenario === "chain_drive_3")!
        .playerSnapshot.extraBasicAttackDamagePct,
    ).toBeGreaterThan(0);
    expect(
      report.rows.find((row) => row.scenario === "triad_decay_3")!
        .playerSnapshot.statusDotDamagePct,
    ).toBe(40);
  });

  it("공통 MP 비용으로 유료 직접 스킬 네 번 이상을 실제 시전한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 1 });

    expect(report.paidDirectSkillMpCost).toBeGreaterThan(0);
    expect(report.initialPaidSkillMp).toBeGreaterThanOrEqual(
      report.paidDirectSkillMpCost * 4,
    );
    expect(
      report.rows.every(
        (row) =>
          row.metrics.paidDirectSkillCasts >= 4 &&
          row.metrics.thirdPaidCastReached,
      ),
    ).toBe(true);
  });

  it("철갑 생존 임계치는 과잉 피해가 아닌 통제 방어 스트레스 행동 수로 측정한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 2 });

    expect(report.defenseStress.definition).toContain("적 행동");
    expect(report.defenseStress.actionLimit).toBeGreaterThan(0);
    expect(report.defenseStress.baselineMedianEnemyActionsSurvived).toBeGreaterThan(0);
    expect(report.defenseStress.ironMedianEnemyActionsSurvived).toBeGreaterThan(0);
    expect(report.defenseStress.baselineMaxEnemyActions).toBeLessThanOrEqual(
      report.defenseStress.actionLimit,
    );
    expect(report.defenseStress.ironMaxEnemyActions).toBeLessThanOrEqual(
      report.defenseStress.actionLimit,
    );
    expect(report.defenseStress.baselinePlayerKills).toBe(0);
    expect(report.defenseStress.ironPlayerKills).toBe(0);
    expect(
      Object.values(report.defenseStress)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite),
    ).toBe(true);
  });

  it("다섯 공격 효과를 동일 seed 제거 대조군과 비교해 실제 적용·소비를 증명한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 1 });
    const expected = [
      "triad_dot_amplification",
      "precision_fourth_basic",
      "chain_extra_basic",
      "revenge_consume_boost",
      "colossus_defense_reduction",
    ] as const;

    expect(Object.keys(report.pairedEffectChecks)).toEqual(expected);
    for (const key of expected) {
      const check = report.pairedEffectChecks[key];
      expect(check.opportunities).toBeGreaterThanOrEqual(check.activations);
      expect(check.activations).toBeGreaterThan(0);
      expect(check.resultDelta).toBeGreaterThan(0);
      expect(check.passed).toBe(true);
    }
    expect(validateUnexploredSpecialtySetSimulation(report)).toEqual([]);
  });

  it("효과가 적용되지 않는 mutation은 validator를 통과하지 못한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 1 });
    const mutated = structuredClone(report);
    mutated.pairedEffectChecks.precision_fourth_basic.resultDelta = 0;
    mutated.pairedEffectChecks.precision_fourth_basic.activations = 0;

    expect(validateUnexploredSpecialtySetSimulation(mutated)).toContain(
      "precision_fourth_basic: 제거 대조군과 실제 효과 차이 없음",
    );

    const nonFinite = structuredClone(report);
    nonFinite.pairedEffectChecks.chain_extra_basic.resultDelta = Number.NaN;
    expect(validateUnexploredSpecialtySetSimulation(nonFinite)).toContain(
      "chain_extra_basic: 제거 대조군과 실제 효과 차이 없음",
    );
  });
});
