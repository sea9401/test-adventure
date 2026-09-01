import { describe, expect, it } from "vitest";
import {
  TIER7_COMBAT_JOB_IDS,
  TIER7_COMBAT_JOB_PREREQS,
  tier7MechanicPower,
  tier7CombatJobIdForSkillId,
  tier7PvpDirectDamagePct,
  validateTier7Package,
  type Tier7Mechanic,
} from "./tier7SkillMechanics";

type PackageSkill = {
  spCost?: number;
  powerScore?: number;
};

describe("tier 7 capstone contract", () => {
  it("uses separately calibrated tier-7 sword PvP direct damage", () => {
    expect(
      tier7PvpDirectDamagePct({
        kind: "shadowStrike",
        recordPct: 70,
        refinedRecordPct: 85,
        pvpDirectDamagePct: 92.2,
      }),
    ).toBe(92.2);
    expect(
      tier7PvpDirectDamagePct({
        kind: "intentStrike",
        missingHpBonusCapPct: 22.2,
        lowHpThresholdPct: 40,
        pvpDirectDamagePct: 95,
      }),
    ).toBe(95);
    expect(tier7PvpDirectDamagePct(undefined)).toBe(100);
  });

  it("keeps the approved internal jobs and prerequisite pairs together", () => {
    expect(TIER7_COMBAT_JOB_IDS).toEqual([
      "shadowblade",
      "ruinblade",
      "skyascendant",
      "primordialsage",
    ]);
    expect(TIER7_COMBAT_JOB_PREREQS).toEqual({
      shadowblade: ["swordsaint", "blackmoon"],
      ruinblade: ["swordsaint", "hegemon"],
      skyascendant: ["heavenlybow", "celestialdragon"],
      primordialsage: ["archmage", "primordialmage"],
    });
  });

  it("recognizes only skill ids owned by an internal tier 7 job", () => {
    expect(tier7CombatJobIdForSkillId("v2c_shadowblade_afterimage")).toBe(
      "shadowblade",
    );
    expect(tier7CombatJobIdForSkillId("v2c_primordialsage_greatorb")).toBe(
      "primordialsage",
    );
    expect(tier7CombatJobIdForSkillId("v2c_swordsaint_flash")).toBeNull();
    expect(tier7CombatJobIdForSkillId("v2c_shadowbladefake_attack")).toBeNull();
  });

  it("accepts only a 46 SP package inside both approved power bands", () => {
    const valid: PackageSkill[] = [
      { spCost: 14, powerScore: 4.2 },
      { spCost: 12, powerScore: 4.1 },
      { spCost: 20, powerScore: 8.1 },
    ];

    expect(validateTier7Package(valid, (skill) => skill.powerScore ?? 0)).toEqual({
      sp: 46,
      score: 16.4,
      efficiency: 0.36,
    });
    expect(() =>
      validateTier7Package(
        valid.map((skill, index) =>
          index === 0 ? { ...skill, spCost: 13 } : skill,
        ),
        (skill) => skill.powerScore ?? 0,
      ),
    ).toThrow("46 SP");
    expect(() =>
      validateTier7Package(
        valid.map((skill, index) =>
          index === 0 ? { ...skill, powerScore: 3.8 } : skill,
        ),
        (skill) => skill.powerScore ?? 0,
      ),
    ).toThrow("0.35");
    expect(() =>
      validateTier7Package(
        valid.map((skill, index) =>
          index === 2 ? { ...skill, powerScore: 9.9 } : skill,
        ),
        (skill) => skill.powerScore ?? 0,
      ),
    ).toThrow("16–18");
  });

  it.each<[Tier7Mechanic, number]>([
    [{ kind: "shadowStrike", recordPct: 70, refinedRecordPct: 85, pvpDirectDamagePct: 92.2 }, 1.55],
    [{ kind: "shadowRefine", refinePctPoints: 15, hastePct: 20, pvpDirectDamagePct: 92.2 }, 2],
    [
      {
        kind: "shadowCore",
        recordPct: 50,
        inheritedRecordPct: 10,
        refinedRecordPct: 65,
        nextSingleDamagePct: 15,
        pvpScalePct: 92.2,
      },
      8.1,
    ],
    [{ kind: "intentStrike", missingHpBonusCapPct: 22.2, lowHpThresholdPct: 40, pvpDirectDamagePct: 95 }, 1.74],
    [{ kind: "intentCore", maxStacks: 3, damagePctPerStack: 8, finisherPctPerStack: 15 }, 2.73],
    [
      {
        kind: "chargedFinisher",
        currentMissingHpCapPct: 75,
        chargeLostHpCapPct: 75,
        requiredIntentStacks: 3,
        pvpCapPct: 40,
        pvpPenetrationPct: 30,
        pvpDirectDamagePct: 100,
      },
      4.88,
    ],
    [{ kind: "crossStrike", family: "ranged" }, 1.5],
    [
      {
        kind: "crossCore",
        captureDamagePct: 20,
        captureAccuracyPct: 25,
        capturePenetrationPct: 45,
        pursuitDamagePct: 40,
        pursuitEnemyDelayPct: 20,
        hastePct: 15,
        pvpCaptureDamagePct: 12,
        pvpCapturePenetrationPct: 10,
        pvpPursuitDamagePct: 25,
        pvpPursuitEnemyDelayPct: 10,
        pvpHastePct: 10,
      },
      4.69,
    ],
    [{ kind: "formulaStrike", stages: 1, completionHastePct: 15 }, 2.2],
    [{ kind: "manaOptimization", restoreMaxMpPct: 10, allowCompletionOverdraft: true }, 1.5],
    [
      {
        kind: "completeFormula",
        directDamagePct: 50,
        penetrationPct: 35,
        hastePct: 20,
        pvpDamagePct: 30,
        pvpPenetrationPct: 20,
        pvpHastePct: 12,
      },
      4.21,
    ],
  ])("prices %s from its runtime fields", (mechanic, expected) => {
    expect(tier7MechanicPower(mechanic)).toBe(expected);
  });
});
