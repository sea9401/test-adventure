import { describe, expect, it } from "vitest";
import {
  applyEvasionDamageReduction,
  attackMissPct,
  evasionDamageReductionPct,
  pvpAttackMissPct,
  pvpEvasionDamageReductionPct,
  magicBarrierStats,
  magicDefenseDamageReductionPct,
  physicalDefenseDamageReductionPct,
  absorbWithMagicBarrier,
} from "./v2CombatConstants";

describe("방어 경감 UI 공용 계산", () => {
  it("물리 방어는 85%에 점근하고 마법 방어는 현재 공격력과 대결한다", () => {
    expect(physicalDefenseDamageReductionPct(500)).toBeCloseTo(42.5, 5);
    expect(physicalDefenseDamageReductionPct(1_000_000)).toBeLessThan(85);
    expect(magicDefenseDamageReductionPct(1_000, 500)).toBeCloseTo(60, 5);
    expect(magicDefenseDamageReductionPct(0, 500)).toBe(0);
  });
});

describe("회피도·적중도 직접 피해 경감", () => {
  it("PvE는 85% × 회피도 / (회피도 + 적중도 × 2.5)로 계산한다", () => {
    expect(evasionDamageReductionPct(100, 200)).toBeCloseTo(14.1667, 3);
    expect(evasionDamageReductionPct(400, 200)).toBeCloseTo(37.7778, 3);
    expect(evasionDamageReductionPct(2_500, 200)).toBeCloseTo(70.8333, 3);
  });

  it("PvP는 적중 대응 계수 3을 사용한다", () => {
    expect(pvpEvasionDamageReductionPct(400, 200)).toBeCloseTo(34, 5);
    expect(pvpEvasionDamageReductionPct(2_500, 200)).toBeCloseTo(68.5484, 3);
  });

  it("일반 회피는 완전 회피를 만들지 않고 양수 피해를 최소 1 남긴다", () => {
    expect(attackMissPct()).toBe(0);
    expect(pvpAttackMissPct()).toBe(0);
    expect(applyEvasionDamageReduction(1_000, 37.7778)).toBe(622);
    expect(applyEvasionDamageReduction(1, 85)).toBe(1);
    expect(evasionDamageReductionPct(1_000_000_000, 200)).toBeLessThan(85);
  });

  it("적중도를 높이면 같은 회피도의 경감률이 내려간다", () => {
    expect(evasionDamageReductionPct(1_000, 400)).toBeLessThan(
      evasionDamageReductionPct(1_000, 200),
    );
  });
});

describe("INT 마력 장벽", () => {
  it("기본 INT 15에서는 생기지 않고 초과 INT와 최대 MP로 내구도를 만든다", () => {
    expect(magicBarrierStats(15, 1_500)).toEqual({
      maxDurability: 0,
      pveAbsorbPct: 0,
      pvpAbsorbPct: 0,
    });
    const barrier = magicBarrierStats(315, 1_500);
    expect(barrier.maxDurability).toBe(1_500);
    expect(barrier.pveAbsorbPct).toBeCloseTo(19.0909, 3);
    expect(barrier.pvpAbsorbPct).toBeCloseTo(13.6364, 3);
  });

  it("남은 직접 피해 일부만 내구도로 흡수하며 내구도 이상은 흡수하지 않는다", () => {
    expect(absorbWithMagicBarrier(1_000, 1_500, 19.0909)).toEqual({
      absorbed: 190,
      damageToHp: 810,
      durabilityLeft: 1_310,
    });
    expect(absorbWithMagicBarrier(1_000, 50, 19.0909)).toEqual({
      absorbed: 50,
      damageToHp: 950,
      durabilityLeft: 0,
    });
  });
});
