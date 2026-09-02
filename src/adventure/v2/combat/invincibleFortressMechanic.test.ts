import { describe, expect, it } from "vitest";

import {
  INVINCIBLE_FORTRESS_BARRIER_TICKS,
  advanceInvincibleFortressBarrier,
  initialInvincibleFortressState,
  invincibleFortressBarrierTarget,
  invincibleFortressEnrageMultipliers,
  invincibleFortressResourceSnapshot,
  invincibleFortressTierForDamage,
  normalizeInvincibleFortressState,
  settleInvincibleFortressDamage,
  type InvincibleFortressBattleState,
} from "./invincibleFortressMechanic";

const MAX_HP = 10_800_000;

describe("invincible fortress mechanic", () => {
  it("keeps the burst-check target capped when only the long-fight HP grows", () => {
    expect(invincibleFortressBarrierTarget(MAX_HP * 10)).toBe(32_400);
  });

  it("starts the 100% barrier for 400 ticks", () => {
    expect(initialInvincibleFortressState(MAX_HP)).toEqual({
      kind: "invincible_fortress",
      completedBarrierCount: 0,
      activeBarrierIndex: 0,
      barrierTicksRemaining: INVINCIBLE_FORTRESS_BARRIER_TICKS,
      barrierDamage: 0,
      enrageTier: 0,
      barrierResults: [],
    });
  });

  it.each([
    [32_400, 0],
    [32_399, 1],
    [24_300, 1],
    [24_299, 2],
    [16_200, 2],
    [16_199, 3],
    [8_100, 3],
    [8_099, 4],
  ] as const)("grades %i barrier damage as tier %i", (damage, tier) => {
    expect(invincibleFortressTierForDamage(damage, MAX_HP)).toBe(tier);
  });

  it("absorbs active-barrier damage without reducing body HP", () => {
    const result = settleInvincibleFortressDamage({
      state: initialInvincibleFortressState(MAX_HP),
      currentHp: MAX_HP,
      incomingDamage: 12_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: MAX_HP,
      bodyDamage: 0,
      barrierDamageApplied: 12_000,
    });
    expect(result.state.barrierDamage).toBe(12_000);
  });

  it("clamps body HP at 75% and sends overflow into the next barrier", () => {
    const state: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 3,
      barrierResults: [3],
    };
    const result = settleInvincibleFortressDamage({
      state,
      currentHp: 8_200_000,
      incomingDamage: 250_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: 8_100_000,
      bodyDamage: 100_000,
      barrierDamageApplied: 32_400,
    });
    expect(result.state).toMatchObject({
      activeBarrierIndex: 1,
      barrierDamage: 32_400,
      enrageTier: 0,
    });
  });

  it("does not skip a later HP boundary with excessive damage", () => {
    const state: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierResults: [0],
    };

    const result = settleInvincibleFortressDamage({
      state,
      currentHp: 8_200_000,
      incomingDamage: MAX_HP,
      maxHp: MAX_HP,
    });

    expect(result.bodyHp).toBe(8_100_000);
    expect(result.state).toMatchObject({
      completedBarrierCount: 1,
      activeBarrierIndex: 1,
      barrierDamage: 32_400,
    });
  });

  it("finishes exactly at zero ticks and replaces the enrage tier", () => {
    const initial: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(MAX_HP),
      barrierDamage: 20_000,
      enrageTier: 4,
    };

    const result = advanceInvincibleFortressBarrier({
      state: initial,
      elapsedTicks: 400,
      maxHp: MAX_HP,
    });

    expect(result.completedTier).toBe(2);
    expect(result.state).toEqual({
      kind: "invincible_fortress",
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: 2,
      barrierResults: [2],
    });
  });

  it("keeps an unfinished trial active when fewer than 400 ticks pass", () => {
    const result = advanceInvincibleFortressBarrier({
      state: initialInvincibleFortressState(MAX_HP),
      elapsedTicks: 399,
      maxHp: MAX_HP,
    });

    expect(result.completedTier).toBeNull();
    expect(result.state).toMatchObject({
      activeBarrierIndex: 0,
      barrierTicksRemaining: 1,
    });
  });

  it("normalizes corrupt state without skipping the HP-implied stage", () => {
    expect(
      normalizeInvincibleFortressState(
        {
          kind: "invincible_fortress",
          completedBarrierCount: 99,
          activeBarrierIndex: 3,
          barrierTicksRemaining: -10,
          barrierDamage: -1,
          enrageTier: 99,
          barrierResults: [99],
        },
        MAX_HP,
        MAX_HP,
      ),
    ).toEqual(initialInvincibleFortressState(MAX_HP));
  });

  it("recovers missing legacy state from current shared HP without retroactive enrage", () => {
    expect(normalizeInvincibleFortressState(undefined, MAX_HP, 6_480_000)).toEqual({
      kind: "invincible_fortress",
      completedBarrierCount: 2,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: 0,
      barrierResults: [],
    });
  });

  it("returns the exact phase-local attack and speed multipliers", () => {
    expect([0, 1, 2, 3, 4].map((tier) =>
      invincibleFortressEnrageMultipliers(tier as 0 | 1 | 2 | 3 | 4),
    )).toEqual([
      { atkMult: 1, spdMult: 1 },
      { atkMult: 1.08, spdMult: 1.04 },
      { atkMult: 1.16, spdMult: 1.08 },
      { atkMult: 1.28, spdMult: 1.12 },
      { atkMult: 1.4, spdMult: 1.16 },
    ]);
  });

  it("formats active and normal resource snapshots from the same state", () => {
    expect(invincibleFortressResourceSnapshot({
      ...initialInvincibleFortressState(MAX_HP),
      barrierTicksRemaining: 160,
      barrierDamage: 18_200,
    }, MAX_HP)).toEqual({
      fortressTrial: "240 / 400틱",
      fortressDamage: "18,200 / 32,400",
      fortressEnrage: "보통",
    });

    expect(invincibleFortressResourceSnapshot({
      ...initialInvincibleFortressState(MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 3,
      barrierResults: [3],
    }, MAX_HP)).toEqual({
      fortressEnrage: "강함 (3단계) · 공격 +28% · 속도 +12%",
    });
  });
});
