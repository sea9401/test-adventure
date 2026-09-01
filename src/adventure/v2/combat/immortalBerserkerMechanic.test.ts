import { describe, expect, it } from "vitest";

import {
  advanceImmortalBerserkerEnemyAction,
  initialImmortalBerserkerState,
  immortalBerserkerDisplay,
  immortalBerserkerMultipliers,
  normalizeImmortalBerserkerState,
  settleImmortalBerserkerDamage,
  type ImmortalBerserkerBattleState,
} from "./immortalBerserkerMechanic";

const MAX_HP = 10_800_000;

describe("immortal berserker mechanic", () => {
  it("starts with three regeneration uses in the first life", () => {
    expect(initialImmortalBerserkerState(MAX_HP)).toEqual({
      kind: "immortal_berserker",
      lifeIndex: 0,
      regenActionCount: 0,
      regenUsesRemaining: 3,
      revivalsCompleted: 0,
    });
  });

  it("blocks overkill at the first life boundary and revives", () => {
    expect(settleImmortalBerserkerDamage({
      state: initialImmortalBerserkerState(MAX_HP),
      currentHp: 7_236_010,
      incomingDamage: 100,
      maxHp: MAX_HP,
    })).toEqual({
      hp: 7_236_000,
      appliedDamage: 10,
      blockedDamage: 90,
      revived: true,
      cancelledRemainingActionDamage: true,
      state: {
        kind: "immortal_berserker",
        lifeIndex: 1,
        regenActionCount: 0,
        regenUsesRemaining: 2,
        revivalsCompleted: 1,
      },
    });
  });

  it("only dies after the third life reaches zero", () => {
    const state: ImmortalBerserkerBattleState = {
      kind: "immortal_berserker",
      lifeIndex: 2,
      regenActionCount: 0,
      regenUsesRemaining: 0,
      revivalsCompleted: 2,
    };
    expect(settleImmortalBerserkerDamage({
      state,
      currentHp: 50,
      incomingDamage: 100,
      maxHp: MAX_HP,
    })).toEqual({
      state,
      hp: 0,
      appliedDamage: 50,
      blockedDamage: 50,
      revived: false,
      cancelledRemainingActionDamage: false,
    });
  });

  it("regenerates after each fourth action within the current life ceiling", () => {
    const first = advanceImmortalBerserkerEnemyAction({
      state: {
        ...initialImmortalBerserkerState(MAX_HP),
        regenActionCount: 3,
      },
      currentHp: 10_500_000,
      maxHp: MAX_HP,
    });
    expect(first).toMatchObject({
      hp: 10_642_560,
      healed: 142_560,
      regenerationTriggered: true,
      state: { regenActionCount: 0, regenUsesRemaining: 2 },
    });

    const capped = advanceImmortalBerserkerEnemyAction({
      state: {
        ...initialImmortalBerserkerState(MAX_HP),
        regenActionCount: 3,
      },
      currentHp: 10_750_000,
      maxHp: MAX_HP,
    });
    expect(capped).toMatchObject({
      hp: MAX_HP,
      healed: 50_000,
      regenerationTriggered: true,
      state: { regenUsesRemaining: 2 },
    });
  });

  it("uses weaker regeneration in life two and none in life three", () => {
    const second: ImmortalBerserkerBattleState = {
      kind: "immortal_berserker",
      lifeIndex: 1,
      regenActionCount: 3,
      regenUsesRemaining: 2,
      revivalsCompleted: 1,
    };
    expect(advanceImmortalBerserkerEnemyAction({
      state: second,
      currentHp: 6_000_000,
      maxHp: MAX_HP,
    })).toMatchObject({ hp: 6_106_920, healed: 106_920 });

    const third: ImmortalBerserkerBattleState = {
      kind: "immortal_berserker",
      lifeIndex: 2,
      regenActionCount: 0,
      regenUsesRemaining: 0,
      revivalsCompleted: 2,
    };
    expect(advanceImmortalBerserkerEnemyAction({
      state: third,
      currentHp: 3_000_000,
      maxHp: MAX_HP,
    })).toEqual({
      state: third,
      hp: 3_000_000,
      healed: 0,
      regenerationTriggered: false,
    });
  });

  it("normalizes missing and corrupt state from shared hp without restoring uses", () => {
    expect(normalizeImmortalBerserkerState(undefined, MAX_HP, 5_000_000)).toEqual({
      kind: "immortal_berserker",
      lifeIndex: 1,
      regenActionCount: 0,
      regenUsesRemaining: 0,
      revivalsCompleted: 1,
    });
    expect(normalizeImmortalBerserkerState({
      kind: "immortal_berserker",
      lifeIndex: 99,
      regenActionCount: 99,
      regenUsesRemaining: 99,
      revivalsCompleted: 99,
    }, MAX_HP, 8_000_000)).toEqual({
      kind: "immortal_berserker",
      lifeIndex: 0,
      regenActionCount: 3,
      regenUsesRemaining: 3,
      revivalsCompleted: 0,
    });
  });

  it("returns exact life multipliers and display values", () => {
    expect([0, 1, 2].map((life) => immortalBerserkerMultipliers(life as 0 | 1 | 2))).toEqual([
      { atkMult: 1, spdMult: 1 },
      { atkMult: 1.12, spdMult: 1.06 },
      { atkMult: 1.25, spdMult: 1.12 },
    ]);
    expect(immortalBerserkerDisplay({
      kind: "immortal_berserker",
      lifeIndex: 1,
      regenActionCount: 2,
      regenUsesRemaining: 1,
      revivalsCompleted: 1,
    }, MAX_HP, 5_500_000)).toEqual({
      lifeIndex: 1,
      lifeHp: 1_828_000,
      lifeMaxHp: 3_564_000,
      regenActionsRemaining: 2,
      regenUsesRemaining: 1,
      nextRegenAmount: 106_920,
      atkMult: 1.12,
      spdMult: 1.06,
    });
  });
});
