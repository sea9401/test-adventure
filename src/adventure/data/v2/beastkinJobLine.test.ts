import { describe, expect, it } from "vitest";
import {
  V2_SKILLS,
  describeV2Skill,
  skillPowerScore,
  spCostOf,
} from "./v2Skills";
import { V2_SKILLS_BY_JOB } from "./v2SkillsByJob";

const PACKAGES = {
  beastwarrior: {
    ids: ["v2c_beastwarrior_reopen", "v2c_beastwarrior_keenscent"],
    power: [2.31, 2.51],
    sp: 8,
  },
  tracker: {
    ids: ["v2c_tracker_pounce", "v2c_tracker_instinct"],
    power: [2.87, 3.07],
    sp: 9,
  },
  bloodtracker: {
    ids: ["v2c_bloodtracker_trailslash", "v2c_bloodtracker_reading"],
    power: [3.65, 3.85],
    sp: 12,
  },
  predator: {
    ids: ["v2c_predator_devour", "v2c_predator_bloodnourishment"],
    power: [5.0, 5.2],
    sp: 15,
  },
  primalpredator: {
    ids: [
      "v2c_primalpredator_primalfeast",
      "v2c_primalpredator_apex",
    ],
    power: [9.2, 9.4],
    sp: 26,
  },
} as const;

describe("beastkin tier 2-6 skill packages", () => {
  it.each(Object.entries(PACKAGES))(
    "%s maps exactly one active and one passive",
    (jobId, expected) => {
      expect(V2_SKILLS_BY_JOB[jobId]).toEqual(expected.ids);
      const [activeId, passiveId] = expected.ids;
      expect(V2_SKILLS[activeId].category).toBe("attack");
      expect(V2_SKILLS[passiveId].category).toBe("passive");
      expect(V2_SKILLS[activeId].fixedMpCost).toBeUndefined();
      expect(V2_SKILLS[activeId].cooldown).toBe(0);
      expect(V2_SKILLS[activeId].spCostDiscount).toBeUndefined();
      expect(V2_SKILLS[passiveId].spCostDiscount).toBeUndefined();
    },
  );

  it.each(Object.entries(PACKAGES))(
    "%s stays inside the approved power and SP envelope",
    (jobId, expected) => {
      const skills = expected.ids.map((id) => V2_SKILLS[id]);
      const power = skills.reduce(
        (sum, skill) => sum + skillPowerScore(skill),
        0,
      );
      const sp = skills.reduce((sum, skill) => sum + spCostOf(skill), 0);
      expect(power).toBeGreaterThanOrEqual(expected.power[0]);
      expect(power).toBeLessThanOrEqual(expected.power[1]);
      expect(sp).toBe(expected.sp);
    },
  );

  it("declares every approved threshold effect in data", () => {
    expect(V2_SKILLS.v2c_beastwarrior_reopen.bleedHunt).toEqual({
      minStacks: 5,
      hitBleedStacks: 1,
      hitBleedSetTurns: 4,
    });
    expect(V2_SKILLS.v2c_beastwarrior_keenscent.bleedHunt).toEqual({
      minStacks: 5,
      directPhysicalAccuracyPct: 8,
    });
    expect(V2_SKILLS.v2c_tracker_pounce.bleedHunt).toEqual({
      minStacks: 5,
      skillAccuracyPct: 15,
      hitEnemyDelayPct: 20,
    });
    expect(V2_SKILLS.v2c_tracker_instinct).toMatchObject({
      passive: { statPct: { dex: 12 } },
      bleedHunt: { minStacks: 5, directPhysicalHastePct: 6 },
    });
    expect(V2_SKILLS.v2c_bloodtracker_trailslash.bleedHunt).toEqual({
      minStacks: 10,
      hitBleedSetTurns: 4,
    });
    expect(V2_SKILLS.v2c_bloodtracker_reading).toMatchObject({
      passive: { statPct: { str: 18 } },
      bleedHunt: { minStacks: 10, directPhysicalPenetrationPct: 8 },
    });
    expect(V2_SKILLS.v2c_predator_devour.bleedHunt).toEqual({
      minStacks: 10,
      skillActualDamageHealPct: 14,
    });
    expect(V2_SKILLS.v2c_predator_bloodnourishment).toMatchObject({
      passive: { statPct: { str: 12 }, maxHpPct: 12 },
      bleedHunt: { minStacks: 10, bleedTickHealMaxHpPct: 1 },
    });
    expect(V2_SKILLS.v2c_primalpredator_primalfeast.bleedHunt).toEqual({
      minStacks: 10,
      skillPenetrationPct: 12,
      skillActualDamageHealPct: 18,
      castHastePct: 15,
    });
    expect(V2_SKILLS.v2c_primalpredator_apex).toMatchObject({
      passive: { statPct: { str: 24, dex: 18 }, maxHpPct: 16 },
      bleedHunt: {
        minStacks: 10,
        directPhysicalDamagePct: 12,
        directPhysicalHitBleedExtend: {
          chancePct: 30,
          turns: 1,
          maxTurns: 4,
        },
      },
    });
  });

  it("describes threshold mechanics from the same metadata", () => {
    expect(
      describeV2Skill(V2_SKILLS.v2c_primalpredator_primalfeast),
    ).toEqual(
      expect.arrayContaining([
        "출혈 10중첩 이상",
        "이 스킬 방어 관통 +12%p",
        "실제 피해의 18% HP 회복",
        "정상 시전 시 다음 행동 속도 +15%",
      ]),
    );
    expect(describeV2Skill(V2_SKILLS.v2c_primalpredator_apex)).toEqual(
      expect.arrayContaining([
        "출혈 10중첩 이상",
        "직접 물리 스킬 피해 +12%",
        "직접 물리 스킬 명중 시 30% 확률로 출혈 지속 +1 (최대 4회)",
      ]),
    );
  });
});
