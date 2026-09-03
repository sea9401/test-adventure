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
  it("uses a fixed three-million barrier durability", () => {
    expect(invincibleFortressBarrierTarget(MAX_HP * 10)).toBe(3_000_000);
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
    [3_000_000, 0],
    [2_999_999, 1],
    [2_250_000, 1],
    [2_249_999, 2],
    [1_500_000, 2],
    [1_499_999, 3],
    [750_000, 3],
    [749_999, 4],
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

  it("destroys the active barrier and sends excess damage to body HP immediately", () => {
    const result = settleInvincibleFortressDamage({
      state: initialInvincibleFortressState(MAX_HP),
      currentHp: MAX_HP,
      incomingDamage: 3_500_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: 10_300_000,
      bodyDamage: 500_000,
      barrierDamageApplied: 3_000_000,
      barrierStarted: false,
    });
    expect(result.state).toEqual({
      kind: "invincible_fortress",
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: 0,
      barrierResults: [0],
    });
    expect(result.barrierEvents).toEqual([
      {
        kind: "barrier_damage",
        barrierIndex: 0,
        damage: 3_000_000,
        totalDamage: 3_000_000,
      },
      {
        kind: "barrier_destroyed",
        barrierIndex: 0,
        totalDamage: 3_000_000,
        tier: 0,
      },
    ]);
  });

  it("destroys the barrier at exactly three million without body overflow", () => {
    const result = settleInvincibleFortressDamage({
      state: initialInvincibleFortressState(MAX_HP),
      currentHp: MAX_HP,
      incomingDamage: 3_000_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: MAX_HP,
      bodyDamage: 0,
      barrierDamageApplied: 3_000_000,
    });
    expect(result.state).toMatchObject({
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierDamage: 0,
      barrierResults: [0],
    });
  });

  it("consumes a large hit through the body boundary and into the next barrier", () => {
    const result = settleInvincibleFortressDamage({
      state: initialInvincibleFortressState(MAX_HP),
      currentHp: MAX_HP,
      incomingDamage: 7_000_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: 8_100_000,
      bodyDamage: 2_700_000,
      barrierDamageApplied: 4_300_000,
      barrierStarted: true,
    });
    expect(result.state).toMatchObject({
      completedBarrierCount: 1,
      activeBarrierIndex: 1,
      barrierDamage: 1_300_000,
      barrierResults: [0],
    });
    expect(result.barrierEvents).toEqual([
      {
        kind: "barrier_damage",
        barrierIndex: 0,
        damage: 3_000_000,
        totalDamage: 3_000_000,
      },
      {
        kind: "barrier_destroyed",
        barrierIndex: 0,
        totalDamage: 3_000_000,
        tier: 0,
      },
      { kind: "barrier_started", barrierIndex: 1 },
      {
        kind: "barrier_damage",
        barrierIndex: 1,
        damage: 1_300_000,
        totalDamage: 1_300_000,
      },
    ]);
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
      barrierDamageApplied: 150_000,
    });
    expect(result.state).toMatchObject({
      activeBarrierIndex: 1,
      barrierDamage: 150_000,
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

    expect(result.bodyHp).toBe(3_400_000);
    expect(result.state).toMatchObject({
      completedBarrierCount: 3,
      activeBarrierIndex: null,
      barrierDamage: 0,
      barrierResults: [0, 0, 0],
    });
  });

  it("finishes exactly at zero ticks and replaces the enrage tier", () => {
    const initial: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(MAX_HP),
      barrierDamage: 2_000_000,
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

  it("preserves valid active barrier damage when normalizing a trial", () => {
    expect(normalizeInvincibleFortressState({
      ...initialInvincibleFortressState(MAX_HP),
      barrierTicksRemaining: 160,
      barrierDamage: 1_000_000,
    }, MAX_HP, MAX_HP)).toMatchObject({
      activeBarrierIndex: 0,
      barrierTicksRemaining: 160,
      barrierDamage: 1_000_000,
      enrageTier: 0,
    });
  });

  it("caps an extreme persisted measurement at the barrier durability", () => {
    expect(normalizeInvincibleFortressState({
      ...initialInvincibleFortressState(MAX_HP),
      barrierDamage: Number.MAX_VALUE,
    }, MAX_HP, MAX_HP).barrierDamage).toBe(3_000_000);
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
      barrierDamage: 1_000_000,
    }, MAX_HP)).toEqual({
      fortressTrial: "240 / 400틱",
      fortressDamage: "1,000,000 / 3,000,000",
      fortressEnrage: "강함",
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
