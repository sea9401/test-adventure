import { describe, expect, it } from "vitest";
import {
  consumeShadowFollowUp,
  recordSwordShadow,
  refineSwordShadow,
  releaseSwordShadow,
} from "./shadowBladeCombat";

describe("무영검신 검영", () => {
  it("records final dealt damage and keeps only the stronger shadow", () => {
    const first = recordSwordShadow({
      sourceSkillId: "v2c_swordsaint_flash",
      dealtDamage: 1_000,
      recordPct: 50,
    });
    expect(first).toMatchObject({
      sourceFinalDamage: 1_000,
      recordPct: 50,
      refined: false,
    });
    expect(
      recordSwordShadow({
        existing: first,
        sourceSkillId: "v2c_shadowblade_afterimage",
        dealtDamage: 600,
        recordPct: 70,
      }),
    ).toEqual(first);
    expect(
      recordSwordShadow({
        existing: first,
        sourceSkillId: "v2c_shadowblade_afterimage",
        dealtDamage: 800,
        recordPct: 70,
      }),
    ).toMatchObject({
      sourceSkillId: "v2c_shadowblade_afterimage",
      sourceFinalDamage: 800,
      recordPct: 70,
    });
  });

  it("refines once by percentage points and releases without a new hit roll", () => {
    const recorded = recordSwordShadow({
      sourceSkillId: "v2c_shadowblade_afterimage",
      dealtDamage: 1_000,
      recordPct: 70,
    });
    const refined = refineSwordShadow(recorded, 15);
    expect(refined).toMatchObject({ recordPct: 85, refined: true });
    expect(refineSwordShadow(refined, 15)).toEqual(refined);
    expect(
      releaseSwordShadow(refined, { nextSingleDamagePct: 15 }),
    ).toEqual({ damage: 850, followUpPct: 15 });
  });

  it("applies the PvP scale to both recorded damage and follow-up", () => {
    const recorded = recordSwordShadow({
      sourceSkillId: "v2c_shadowblade_afterimage",
      dealtDamage: 1_000,
      recordPct: 70,
      pvpScalePct: 80,
    });
    expect(releaseSwordShadow(recorded, { nextSingleDamagePct: 12 })).toEqual({
      damage: 560,
      followUpPct: 12,
    });
  });

  it("consumes the queued bonus on the next attempted single physical action", () => {
    expect(
      consumeShadowFollowUp({
        pendingPct: 15,
        isSinglePhysical: false,
        hit: true,
        damage: 1_000,
      }),
    ).toEqual({ damage: 1_000, pendingPct: 15 });
    expect(
      consumeShadowFollowUp({
        pendingPct: 15,
        isSinglePhysical: true,
        hit: false,
        damage: 0,
      }),
    ).toEqual({ damage: 0, pendingPct: 0 });
    expect(
      consumeShadowFollowUp({
        pendingPct: 15,
        isSinglePhysical: true,
        hit: true,
        damage: 1_000,
      }),
    ).toEqual({ damage: 1_150, pendingPct: 0 });
  });
});
