import { describe, it, expect } from "vitest";
import { lowHpDamageReductionPct } from "./signatureEffects";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";

const RELIC: SignatureEffect = {
  trigger: "low_hp",
  label: "성물",
  hpThresholdPct: 30,
  damageTakenReductionPct: 25,
};

describe("lowHpDamageReductionPct (성물 저체력 받피감)", () => {
  it("시그니처 없음/빈 배열 → 0 (골든 byte-identical 가드)", () => {
    expect(lowHpDamageReductionPct(undefined, 10, 100)).toBe(0);
    expect(lowHpDamageReductionPct([], 10, 100)).toBe(0);
  });

  it("HP 가 임계% 초과면 0 (조건 미충족)", () => {
    // 임계 30% → maxHp 100 의 30 = 30. HP 31 > 30 → 미발동.
    expect(lowHpDamageReductionPct([RELIC], 31, 100)).toBe(0);
  });

  it("HP 가 임계% 이하면 받피감 % 반환", () => {
    expect(lowHpDamageReductionPct([RELIC], 30, 100)).toBe(25); // 경계(=) 포함
    expect(lowHpDamageReductionPct([RELIC], 10, 100)).toBe(25);
  });

  it("low_hp 아닌 트리거는 무시", () => {
    const onCrit: SignatureEffect = {
      trigger: "on_crit",
      label: "군림",
      spdBuffPct: 20,
    };
    expect(lowHpDamageReductionPct([onCrit], 5, 100)).toBe(0);
  });

  it("여러 low_hp 시그니처는 합산(조건 충족분만)", () => {
    const other: SignatureEffect = {
      trigger: "low_hp",
      label: "기타",
      hpThresholdPct: 50,
      damageTakenReductionPct: 10,
    };
    // HP 25 → RELIC(≤30 ✓ +25) + other(≤50 ✓ +10) = 35.
    expect(lowHpDamageReductionPct([RELIC, other], 25, 100)).toBe(35);
    // HP 40 → RELIC(≤30 ✗) + other(≤50 ✓ +10) = 10.
    expect(lowHpDamageReductionPct([RELIC, other], 40, 100)).toBe(10);
  });

  it("maxHp 0 가드 → 0 (0 나눗셈 회피)", () => {
    expect(lowHpDamageReductionPct([RELIC], 0, 0)).toBe(0);
  });

  it("damageTakenReductionPct 없는 low_hp 는 무시", () => {
    const noPct: SignatureEffect = {
      trigger: "low_hp",
      label: "빈",
      hpThresholdPct: 30,
    };
    expect(lowHpDamageReductionPct([noPct], 5, 100)).toBe(0);
  });
});
