import { describe, expect, it } from "vitest";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  TIER6_UNLOCK_CUMLEVEL,
  jobById,
} from "./v2JobCatalog";
import { effectiveCultivateProfile } from "./proficiency";
import {
  V2_SKILLS,
  describeV2Skill,
  spCostOf,
} from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";

describe("빙천제 6차 카탈로그", () => {
  it("빙결술사 숙련도로 해금되는 6차 냉기 직업이다", () => {
    expect(jobById("frostsovereign")).toMatchObject({
      id: "frostsovereign",
      name: "빙천제",
      tier: 6,
      unlock: { prereqs: { cryomancer: TIER6_UNLOCK_CUMLEVEL } },
      jobBonus: { int: 28, spi: 12 },
    });
    expect(effectiveCultivateProfile("mage", "frostsovereign")).toEqual({
      int: 3,
      spi: 3,
    });
    expect(LEGACY_CLASS_SPEC_BY_JOB.frostsovereign).toEqual({
      class: "mage",
      spec: "frostsovereign",
    });
  });

  it("영겁빙옥과 영구동토를 정확한 비용과 효과로 제공한다", () => {
    expect(skillsForJob("frostsovereign")).toEqual([
      "v2c_frostsovereign_eternalprison",
      "v2c_frostsovereign_permafrost",
    ]);
    expect(V2_SKILLS.v2c_frostsovereign_eternalprison).toMatchObject({
      name: "영겁빙옥",
      fixedMpCost: 195,
      procChance: 45,
      learnCost: 12000,
      spCost: 10,
      frostChillGain: 4,
      effects: [
        { kind: "damage", statCoef: 2.85, baseFlat: 722, scaling: "magic" },
      ],
    });
    expect(V2_SKILLS.v2c_frostsovereign_permafrost).toMatchObject({
      name: "영구동토",
      learnCost: 12000,
      spCost: 11,
      passive: {
        maxMpPct: 16,
        freezeDamagePct: 35,
        freezeDelayPct: 50,
        freezeRetainStacks: 1,
      },
    });
    expect(spCostOf(V2_SKILLS.v2c_frostsovereign_eternalprison)).toBe(10);
    expect(spCostOf(V2_SKILLS.v2c_frostsovereign_permafrost)).toBe(11);
  });

  it("새 한기 생성량과 잔류 규칙을 설명한다", () => {
    expect(
      describeV2Skill(V2_SKILLS.v2c_frostsovereign_eternalprison),
    ).toContain("적중 시 한기 +4");
    expect(
      describeV2Skill(V2_SKILLS.v2c_frostsovereign_permafrost),
    ).toContain("빙결 후 한기 1 잔류");
  });
});
