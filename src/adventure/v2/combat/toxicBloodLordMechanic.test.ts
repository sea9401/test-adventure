import { describe, expect, it } from "vitest";

import {
  consumeToxicRecoveryAction,
  resolveToxicBloodGain,
  toxicBloodRawDotDamage,
  toxicBloodRawExplosionDamage,
  toxicBloodRecoveryMultiplier,
} from "./toxicBloodLordMechanic";

describe("toxic blood lord mechanic", () => {
  it("9+1과 8+2에서 한 번 폭발하고 초과분 없이 0이 된다", () => {
    expect(resolveToxicBloodGain({ current: 9, gain: 1 })).toEqual({
      stacks: 0,
      exploded: true,
    });
    expect(resolveToxicBloodGain({ current: 8, gain: 2 })).toEqual({
      stacks: 0,
      exploded: true,
    });
    expect(resolveToxicBloodGain({ current: 9, gain: 2 })).toEqual({
      stacks: 0,
      exploded: true,
    });
  });

  it("10 미만에서는 정규화한 중첩을 유지한다", () => {
    expect(resolveToxicBloodGain({ current: 5.9, gain: 2.8 })).toEqual({
      stacks: 7,
      exploded: false,
    });
    expect(resolveToxicBloodGain({ current: Number.NaN, gain: -3 })).toEqual({
      stacks: 0,
      exploded: false,
    });
  });

  it("최대 HP 100000의 6중첩 지속 피해와 폭발 피해를 계산한다", () => {
    expect(toxicBloodRawDotDamage(100_000, 6)).toBe(1_800);
    expect(toxicBloodRawExplosionDamage(100_000)).toBe(20_000);
  });

  it("양수 중첩의 소수점 이하 지속 피해는 최소 1이다", () => {
    expect(toxicBloodRawDotDamage(1, 1)).toBe(1);
    expect(toxicBloodRawDotDamage(100_000, 0)).toBe(0);
  });

  it("중첩형과 폭발 후 회복 감소 중 더 강한 하나만 쓴다", () => {
    expect(
      toxicBloodRecoveryMultiplier({ stacks: 9, recoveryLockActions: 0 }),
    ).toBeCloseTo(0.73);
    expect(
      toxicBloodRecoveryMultiplier({ stacks: 2, recoveryLockActions: 2 }),
    ).toBe(0.5);
    expect(consumeToxicRecoveryAction(2)).toBe(1);
    expect(consumeToxicRecoveryAction(1)).toBe(0);
    expect(consumeToxicRecoveryAction(Number.NaN)).toBe(0);
  });
});
