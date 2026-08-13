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
  partitionWithMagicBarrier,
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

describe("마나 실드 수치", () => {
  it("기본 INT 15에서는 생기지 않고 초과 INT와 최대 MP로 내구도·흡수율·경감률을 만든다", () => {
    expect(magicBarrierStats(15, 1_500)).toEqual({
      maxDurability: 0,
      pveAbsorbPct: 0,
      pvpAbsorbPct: 0,
      pveEfficiencyPct: 0,
      pvpEfficiencyPct: 0,
    });
    const barrier = magicBarrierStats(315, 1_500);
    expect(barrier.maxDurability).toBe(1_500);
    expect(barrier.pveAbsorbPct).toBeCloseTo(24.5455, 3);
    expect(barrier.pvpAbsorbPct).toBeCloseTo(16.3636, 3);
    expect(barrier.pveEfficiencyPct).toBeCloseTo(15, 5);
    expect(barrier.pvpEfficiencyPct).toBeCloseTo(10, 5);
  });

  it("피해를 방어 전 몸통·마나 채널로 나누고 경감된 내구도를 소모한다", () => {
    expect(partitionWithMagicBarrier(1_000, 1_500, 25, 20)).toEqual({
      bodyRawDamage: 750,
      absorbedDamage: 250,
      spillDamage: 0,
      durabilitySpent: 200,
      durabilityLeft: 1_300,
      destroyed: false,
    });
  });

  it("내구도가 부족하면 감당 가능한 정수 피해만 막고 나머지는 넘친다", () => {
    expect(partitionWithMagicBarrier(1_000, 50, 25, 20)).toEqual({
      bodyRawDamage: 750,
      absorbedDamage: 62,
      spillDamage: 188,
      durabilitySpent: 50,
      durabilityLeft: 0,
      destroyed: true,
    });
    expect(partitionWithMagicBarrier(1_000, 1, 25, 20)).toEqual({
      bodyRawDamage: 750,
      absorbedDamage: 1,
      spillDamage: 249,
      durabilitySpent: 1,
      durabilityLeft: 0,
      destroyed: true,
    });
  });

  it("내구도 비용 올림과 정확한 0 소진을 결정적으로 처리한다", () => {
    expect(partitionWithMagicBarrier(100, 20, 25, 20)).toEqual({
      bodyRawDamage: 75,
      absorbedDamage: 25,
      spillDamage: 0,
      durabilitySpent: 20,
      durabilityLeft: 0,
      destroyed: true,
    });
    expect(partitionWithMagicBarrier(10, 10, 25, 20)).toMatchObject({
      absorbedDamage: 2,
      durabilitySpent: 2,
      durabilityLeft: 8,
    });
  });

  it("피해·내구도·비율 입력을 안전하게 제한하고 비활성 장벽은 무변이다", () => {
    expect(partitionWithMagicBarrier(-10, -3, 25, 20)).toEqual({
      bodyRawDamage: 0,
      absorbedDamage: 0,
      spillDamage: 0,
      durabilitySpent: 0,
      durabilityLeft: 0,
      destroyed: false,
    });
    expect(partitionWithMagicBarrier(100, 50, 0, 20)).toEqual({
      bodyRawDamage: 100,
      absorbedDamage: 0,
      spillDamage: 0,
      durabilitySpent: 0,
      durabilityLeft: 50,
      destroyed: false,
    });
    expect(partitionWithMagicBarrier(100, 50, 200, -10)).toMatchObject({
      bodyRawDamage: 0,
      absorbedDamage: 50,
      spillDamage: 50,
      durabilitySpent: 50,
      durabilityLeft: 0,
    });
    expect(partitionWithMagicBarrier(Number.NaN, Number.POSITIVE_INFINITY, 25, 20)).toEqual({
      bodyRawDamage: 0,
      absorbedDamage: 0,
      spillDamage: 0,
      durabilitySpent: 0,
      durabilityLeft: 0,
      destroyed: false,
    });
  });
});
