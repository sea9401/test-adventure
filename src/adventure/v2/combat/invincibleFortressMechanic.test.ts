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
  type InvincibleFortressEnrageTier,
} from "./invincibleFortressMechanic";

const MAX_HP = 10_800_000;

describe("invincible fortress mechanic", () => {
  it("uses a fixed one-and-a-half-million barrier durability", () => {
    expect(invincibleFortressBarrierTarget(MAX_HP * 10)).toBe(1_500_000);
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
    [1_500_000, 0],
    [1_499_999, 1],
    [1_350_000, 1],
    [1_349_999, 2],
    [1_125_000, 2],
    [1_124_999, 3],
    [900_000, 3],
    [899_999, 4],
    [675_000, 4],
    [674_999, 5],
    [450_000, 5],
    [449_999, 6],
    [225_000, 6],
    [224_999, 7],
    [0, 7],
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
      bodyHp: 8_800_000,
      bodyDamage: 2_000_000,
      barrierDamageApplied: 1_500_000,
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
        damage: 1_500_000,
        totalDamage: 1_500_000,
      },
      {
        kind: "barrier_destroyed",
        barrierIndex: 0,
        totalDamage: 1_500_000,
        tier: 0,
      },
    ]);
  });

  it("destroys the barrier at exactly one-and-a-half million without body overflow", () => {
    const result = settleInvincibleFortressDamage({
      state: initialInvincibleFortressState(MAX_HP),
      currentHp: MAX_HP,
      incomingDamage: 1_500_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: MAX_HP,
      bodyDamage: 0,
      barrierDamageApplied: 1_500_000,
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
      incomingDamage: 5_500_000,
      maxHp: MAX_HP,
    });

    expect(result).toMatchObject({
      bodyHp: 8_100_000,
      bodyDamage: 2_700_000,
      barrierDamageApplied: 2_800_000,
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
        damage: 1_500_000,
        totalDamage: 1_500_000,
      },
      {
        kind: "barrier_destroyed",
        barrierIndex: 0,
        totalDamage: 1_500_000,
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

    expect(result.bodyHp).toBe(1_900_000);
    expect(result.state).toMatchObject({
      completedBarrierCount: 4,
      activeBarrierIndex: null,
      barrierDamage: 0,
      barrierResults: [0, 0, 0, 0],
    });
  });

  it("finishes exactly at zero ticks and replaces the enrage tier", () => {
    const initial: InvincibleFortressBattleState = {
      ...initialInvincibleFortressState(MAX_HP),
      barrierDamage: 1_200_000,
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
    }, MAX_HP, MAX_HP).barrierDamage).toBe(1_500_000);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7] as const)(
    "preserves stored enrage tier %i",
    (tier) => {
      expect(normalizeInvincibleFortressState({
        ...initialInvincibleFortressState(MAX_HP),
        completedBarrierCount: 1,
        activeBarrierIndex: null,
        barrierTicksRemaining: 0,
        enrageTier: tier,
        barrierResults: [tier],
      }, MAX_HP, 8_000_000)).toMatchObject({
        completedBarrierCount: 1,
        activeBarrierIndex: null,
        enrageTier: tier,
        barrierResults: [tier],
      });
    },
  );

  it("returns the exact phase-local attack and speed multipliers", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((tier) =>
      invincibleFortressEnrageMultipliers(tier as InvincibleFortressEnrageTier),
    )).toEqual([
      { atkMult: 1, spdMult: 1 },
      { atkMult: 1.1, spdMult: 1.15 },
      { atkMult: 1.25, spdMult: 1.35 },
      { atkMult: 1.45, spdMult: 1.6 },
      { atkMult: 1.7, spdMult: 1.9 },
      { atkMult: 1.95, spdMult: 2.25 },
      { atkMult: 2.2, spdMult: 2.6 },
      { atkMult: 2.5, spdMult: 3 },
    ]);
  });

  it("formats active and normal resource snapshots from the same state", () => {
    expect(invincibleFortressResourceSnapshot({
      ...initialInvincibleFortressState(MAX_HP),
      barrierTicksRemaining: 160,
      barrierDamage: 1_000_000,
    }, MAX_HP)).toEqual({
      fortressTrial: "240 / 400틱",
      fortressDamage: "1,000,000 / 1,500,000",
      fortressEnrage: "예상 3단계",
    });

    expect(invincibleFortressResourceSnapshot({
      ...initialInvincibleFortressState(MAX_HP),
      completedBarrierCount: 1,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      enrageTier: 3,
      barrierResults: [3],
    }, MAX_HP)).toEqual({
      fortressEnrage: "3단계 · 공격 +45% · 속도 +60%",
    });
  });
});
