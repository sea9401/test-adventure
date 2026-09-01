import { describe, expect, it } from "vitest";
import {
  canStartRuinCharge,
  gainSwordIntent,
  recordChargeHpLoss,
  ruinSwordBonuses,
  startRuinCharge,
} from "./ruinBladeCombat";

describe("멸검제 검의와 충전", () => {
  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, true],
  ])("검의 %i개에서 멸검 충전 가능 여부는 %s다", (intent, expected) => {
    expect(canStartRuinCharge(intent)).toBe(expected);
  });

  it("caps sword intent and supports the low-HP double gain", () => {
    expect(gainSwordIntent(0, 1)).toBe(1);
    expect(gainSwordIntent(1, 2)).toBe(3);
    expect(gainSwordIntent(3, 1)).toBe(3);
  });

  it("tracks only actual HP loss recorded by the caller", () => {
    const charge = startRuinCharge({ hp: 600, intent: 3 });
    expect(recordChargeHpLoss(charge, 0).actualHpLost).toBe(0);
    expect(recordChargeHpLoss(charge, 180)).toMatchObject({
      startHp: 600,
      actualHpLost: 180,
      intentAtStart: 3,
    });
  });

  it("adds independently capped PvE missing-HP, charge-loss, and intent bonuses", () => {
    const charge = recordChargeHpLoss(
      startRuinCharge({ hp: 600, intent: 3 }),
      800,
    );
    expect(
      ruinSwordBonuses({ state: charge, hp: 100, maxHp: 1_000, pvp: false }),
    ).toEqual({ damagePct: 195, penetrationPct: 45 });
  });

  it("uses the charged-finisher caps declared by the equipped skill", () => {
    const charge = recordChargeHpLoss(
      startRuinCharge({ hp: 600, intent: 3 }),
      800,
    );
    expect(
      ruinSwordBonuses({
        state: charge,
        hp: 100,
        maxHp: 1_000,
        pvp: false,
        currentMissingHpCapPct: 55,
        chargeLostHpCapPct: 35,
        pvpCapPct: 40,
        pvpPenetrationPct: 30,
      }),
    ).toEqual({ damagePct: 135, penetrationPct: 45 });
  });

  it("uses 40% component caps and 30 penetration in PvP", () => {
    const charge = recordChargeHpLoss(
      startRuinCharge({ hp: 600, intent: 3 }),
      800,
    );
    expect(
      ruinSwordBonuses({ state: charge, hp: 100, maxHp: 1_000, pvp: true }),
    ).toEqual({ damagePct: 125, penetrationPct: 30 });
  });

  it("maximizes charge loss when the hegemon death bypass triggers", () => {
    const charge = {
      ...startRuinCharge({ hp: 300, intent: 2 }),
      deathBypassTriggered: true,
    };
    expect(
      ruinSwordBonuses({ state: charge, hp: 1, maxHp: 1_000, pvp: false }),
    ).toEqual({ damagePct: 180, penetrationPct: 45 });
  });
});
