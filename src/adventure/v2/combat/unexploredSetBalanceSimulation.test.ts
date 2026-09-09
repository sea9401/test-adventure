import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { initialBattleState, type PlayerCombat } from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import {
  SCENARIO_IDS,
  validateUnexploredSpecialtySetSimulation,
  runUnexploredSpecialtySetSimulation,
} from "../../../../scripts/sim-unexplored-specialty-sets";

describe("unexplored specialty set simulation", () => {
  afterEach(() => vi.restoreAllMocks());
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
    expect(report.defenseStress.enemyCritChancePct).toBeGreaterThan(0);
    expect(report.defenseStress.enemyCritMult).toBeGreaterThan(1);
    expect(report.defenseStress.baselineCritResistPct).toBeGreaterThan(0);
    expect(report.defenseStress.ironCritResistPct).toBeGreaterThan(0);
    expect(
      Object.values(report.defenseStress)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite),
    ).toBe(true);
  });

  it("치명 경계에서 장비 포함 치명 저항이 실제 적 치명타를 막는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.295);
    const enemy: Monster = {
      name: "치명 경계 적",
      hp: 100_000,
      atk: 1_000,
      def: 0,
      spd: 1,
      accuracy: 100,
      critPct: 30,
      critMult: 1.5,
      exp: 0,
      tags: [],
    };
    const player: PlayerCombat = {
      hp: 10_000,
      maxHp: 10_000,
      mp: 0,
      maxMp: 0,
      atk: 1,
      def: 0,
      spd: 1,
      evasionPct: 0,
      accuracyPct: 100,
      attackCount: 1,
      critChancePct: 0,
      critMult: 1.5,
    };
    const hit = (critResistPct: number) => {
      const defender = { ...player, critResistPct };
      const initial = initialBattleState(defender, enemy, "방어자");
      return resolveEnemyPhase(
        {
          ...initial,
          phase: "enemy",
          turn: { ...initial.turn, enemyAttacksLeft: 1 },
        },
        defender,
        "방어자",
        true,
      );
    };
    const critical = hit(0);
    vi.mocked(Math.random).mockReturnValue(0.295);
    const resisted = hit(1);

    expect(critical.log.some((entry) => entry.text.includes("[치명타]"))).toBe(true);
    expect(resisted.log.some((entry) => entry.text.includes("[치명타]"))).toBe(false);
    expect(critical.playerHp).toBe(8_500);
    expect(resisted.playerHp).toBe(9_000);
  });

  it("고정 100 seeds 방어 스트레스에서 실제 치명타와 장비 치명 저항을 함께 계측한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 100 });

    expect(report.seedCount).toBe(100);
    expect(report.defenseStress.baselineCriticalHits).toBeGreaterThan(0);
    expect(report.defenseStress.ironCriticalHits).toBeLessThan(
      report.defenseStress.baselineCriticalHits,
    );
    expect(report.defenseStress.ironCritResistPct).toBeGreaterThan(
      report.defenseStress.baselineCritResistPct,
    );
    expect(validateUnexploredSpecialtySetSimulation(report)).toEqual([]);
  }, 30_000);

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
    const dotCoverage = report.pairedEffectChecks.triad_dot_amplification.coverageDeltas!;
    expect(Object.keys(dotCoverage)).toEqual([
      "pve_skill_poison",
      "pve_skill_bleed",
      "pve_skill_burn",
      "pve_equipment_poison",
      "pve_equipment_bleed",
      "pvp_p1_skill_poison",
      "pvp_p1_skill_bleed",
      "pvp_p1_skill_burn",
      "pvp_p1_equipment_poison",
      "pvp_p1_equipment_bleed",
      "pvp_p2_skill_poison",
      "pvp_p2_skill_bleed",
      "pvp_p2_skill_burn",
      "pvp_p2_equipment_poison",
      "pvp_p2_equipment_bleed",
    ]);
    expect(Object.values(dotCoverage).every((delta) => delta > 0)).toBe(true);
    expect(validateUnexploredSpecialtySetSimulation(report)).toEqual([]);
  });

  it("응징 본표는 큰 피격 기회만 표시하고 실제 소비 발동은 paired probe로 구분한다", async () => {
    const report = await runUnexploredSpecialtySetSimulation({ seedCount: 1 });
    const revenge = report.rows.find(
      (row) => row.scenario === "existing_weapon_3_plus_battle_revenge_3",
    )!;

    expect(revenge.metrics.opportunityCount).toBeGreaterThan(0);
    expect(revenge.metrics.activationCount).toBeNull();
    expect(report.pairedEffectChecks.revenge_consume_boost).toMatchObject({
      activations: 1,
      passed: true,
    });
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

    const missingDotPath = structuredClone(report);
    missingDotPath.pairedEffectChecks.triad_dot_amplification.coverageDeltas!
      .pvp_p2_equipment_bleed = 0;
    expect(validateUnexploredSpecialtySetSimulation(missingDotPath)).toContain(
      "triad_dot_amplification: DOT 실제 엔진 경로 누락",
    );
  });
});
