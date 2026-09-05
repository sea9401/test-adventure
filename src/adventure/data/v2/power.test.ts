import { describe, it, expect } from "vitest";
import {
  derivePowerScore,
  effectiveAttackPowerForScore,
  effectiveRatingForPower,
  effectiveSpeedForPower,
  POWER_SPD_CAP,
  V2_POWER_WEIGHT,
} from "./power";

describe("v2 콘텐츠 파워 지표", () => {
  it("derivePowerScore — 기본 전투 스탯과 회피도·적중도를 합산한다", () => {
    // atk20 + magicAtk0 + def10 + maxHp200×0.1(20) + spd30×0.5(15) + maxMp0 = 65
    expect(
      derivePowerScore({ atk: 20, def: 10, spd: 30, maxHp: 200 }),
    ).toBe(65);
    expect(
      derivePowerScore({
        atk: 20,
        def: 10,
        spd: 30,
        maxHp: 200,
        evaRating: 100,
        accRating: 100,
      }),
    ).toBe(144);
  });

  it("magicAtk·maxMp 도 합산 (마법 빌드)", () => {
    // atk0 + magicAtk40 + def8 + maxHp180×0.1(18) + spd24×0.5(12) + maxMp120×0.1(12) = 90
    expect(
      derivePowerScore({
        atk: 0,
        magicAtk: 40,
        def: 8,
        spd: 24,
        maxHp: 180,
        maxMp: 120,
      }),
    ).toBe(90);
  });

  it("물공·마공은 주 공격력과 보조 공격력 25%만 반영한다", () => {
    expect(effectiveAttackPowerForScore(100, 80)).toBe(120);
    expect(effectiveAttackPowerForScore(80, 100)).toBe(120);
  });

  it("속도 1024까지 기존 점수를 보존하고 이후 행동률에 맞춰 점감한다", () => {
    const justBelowCap = derivePowerScore({
      atk: 0,
      def: 0,
      spd: 1_022,
      maxHp: 0,
    });
    const atLinearLimit = derivePowerScore({
      atk: 0,
      def: 0,
      spd: 1_024,
      maxHp: 0,
    });
    const overflow = derivePowerScore({
      atk: 0,
      def: 0,
      spd: 2_000,
      maxHp: 0,
    });
    const atActionLimit = derivePowerScore({
      atk: 0,
      def: 0,
      spd: 20_000,
      maxHp: 0,
    });
    const extreme = derivePowerScore({
      atk: 0,
      def: 0,
      spd: 200_000,
      maxHp: 0,
    });
    expect(atLinearLimit).toBeGreaterThan(justBelowCap);
    expect(overflow).toBeGreaterThan(atLinearLimit);
    expect(atActionLimit).toBeGreaterThan(overflow);
    expect(extreme).toBe(atActionLimit);
    expect(effectiveSpeedForPower(100)).toBe(100);
    expect(effectiveSpeedForPower(1_024)).toBe(1_024);
    expect(effectiveSpeedForPower(2_000)).toBeCloseTo(1_206.5081, 3);
    expect(effectiveSpeedForPower(20_000)).toBeCloseTo(2_120.9732, 3);
    expect(POWER_SPD_CAP).toBeCloseTo(2_120.9732, 3);
    expect(effectiveRatingForPower(100)).toBeCloseTo(99.0066, 3);
    expect(effectiveRatingForPower(10_000)).toBeLessThan(5_000);
  });

  it("마나 실드는 유한 내구도·부분 흡수임을 반영해 보수적으로 합산한다", () => {
    expect(
      derivePowerScore({
        atk: 0,
        def: 0,
        spd: 0,
        maxHp: 0,
        magicBarrierMax: 1_000,
      }),
    ).toBe(30);
  });

  it("물리·마법 방어는 높은 축 100%와 낮은 축 25%를 반영한다", () => {
    expect(
      derivePowerScore({
        atk: 0,
        def: 100,
        magicDef: 80,
        spd: 0,
        maxHp: 0,
      }),
    ).toBe(120);
  });

  it("치명타 기대 공격 증가분은 50% 가중치로 반영한다", () => {
    expect(
      derivePowerScore({
        atk: 100,
        def: 0,
        spd: 0,
        maxHp: 0,
        critChancePct: 50,
        critMult: 2,
      }),
    ).toBe(125);
  });

  it("받는 피해 감소는 생존 기여분의 실질 내구도 증가량을 반영한다", () => {
    expect(
      derivePowerScore({
        atk: 0,
        def: 0,
        spd: 0,
        maxHp: 1_000,
        damageTakenReductionPct: 20,
      }),
    ).toBe(125);
  });

  it("회복 배율은 HP 기여분의 15%만, 최대 3배까지 보조 반영한다", () => {
    expect(
      derivePowerScore({
        atk: 0,
        def: 0,
        spd: 0,
        maxHp: 1_000,
        healMult: 3,
      }),
    ).toBe(130);
    expect(
      derivePowerScore({
        atk: 0,
        def: 0,
        spd: 0,
        maxHp: 1_000,
        healMult: 30,
      }),
    ).toBe(130);
  });

  it("magicAtk/maxMp 미지정은 0 취급", () => {
    expect(derivePowerScore({ atk: 0, def: 0, spd: 0, maxHp: 0 })).toBe(0);
  });

  it("가중치 상수 노출 — 캘리브 다이얼(PR-9)", () => {
    expect(V2_POWER_WEIGHT.hp).toBe(0.1);
    expect(V2_POWER_WEIGHT.spd).toBe(0.5);
    expect(V2_POWER_WEIGHT.mp).toBe(0.1);
    expect(V2_POWER_WEIGHT.magicBarrier).toBe(0.03);
    expect(V2_POWER_WEIGHT.evasion).toBe(0.45);
    expect(V2_POWER_WEIGHT.accuracy).toBe(0.35);
    expect(V2_POWER_WEIGHT.criticalExpected).toBe(0.5);
    expect(V2_POWER_WEIGHT.healingSupport).toBe(0.15);
  });
});
