import { describe, expect, it } from "vitest";
import { jobDisplayName } from "./classes";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
  TIER6_UNLOCK_CUMLEVEL,
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";

describe("결투가 평타 계보", () => {
  it.each([
    ["duelist", "결투가", 3, { paladin: TIER3_UNLOCK_CUMLEVEL, assassin: TIER3_UNLOCK_CUMLEVEL }, { str: 2, luk: 1, dex: 1 }, { str: 8, luk: 7, dex: 5 }],
    ["contender", "승부사", 4, { duelist: TIER4_UNLOCK_CUMLEVEL }, { str: 2, luk: 1, dex: 1 }, { str: 10, luk: 8, dex: 6 }],
    ["undefeated", "무패자", 5, { contender: TIER5_UNLOCK_CUMLEVEL }, { str: 2, luk: 2, dex: 1 }, { str: 11, luk: 9, dex: 6 }],
    ["grandchampion", "그랜드 챔피언", 6, { undefeated: TIER6_UNLOCK_CUMLEVEL }, { str: 2, luk: 2, dex: 2 }, { str: 16, luk: 14, dex: 10 }],
  ] as const)("%s의 계보와 성장값을 등록한다", (id, name, tier, prereqs, cultivateProfile, jobBonus) => {
    expect(V2_JOB_CATALOG[id]).toEqual({
      id,
      name,
      tier,
      cultivateProfile,
      jobBonus,
      unlock: { prereqs },
    });
  });

  it.each([
    ["duelist", "결투가"],
    ["contender", "승부사"],
    ["undefeated", "무패자"],
    ["grandchampion", "그랜드 챔피언"],
  ] as const)("%s를 전사 직군 저장값으로 왕복한다", (jobId, displayName) => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[jobId]).toEqual({ class: "warrior", spec: jobId });
    expect(jobIdFromLegacy("warrior", jobId)).toBe(jobId);
    expect(jobDisplayName("warrior", jobId)).toBe(displayName);
  });

  it("각 차수에서 선언 하나와 패시브 하나를 배운다", () => {
    expect(skillsForJob("duelist")).toEqual([
      "v2c_duelist_declaration",
      "v2c_duelist_balance",
    ]);
    expect(skillsForJob("contender")).toEqual([
      "v2c_contender_insight",
      "v2c_contender_precision",
    ]);
    expect(skillsForJob("undefeated")).toEqual([
      "v2c_undefeated_momentum",
      "v2c_undefeated_rhythm",
    ]);
    expect(skillsForJob("grandchampion")).toEqual([
      "v2c_grandchampion_hour",
      "v2c_grandchampion_instinct",
    ]);
  });
});
