import { describe, expect, it } from "vitest";
import {
  TIER4_UNLOCK_CUMLEVEL,
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "./v2JobCatalog";
import { parseProficiency } from "./proficiency";
import { V2_SKILLS } from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";

const ELEMENTAL_JOBS = [
  ["firemage", "화염 마법사", "v2c_firemage_inferno", "v2c_firemage_ember"],
  ["frostmage", "냉기 마법사", "v2c_frostmage_glacier", "v2c_frostmage_frozenheart"],
  ["lightningmage", "전격 마법사", "v2c_lightningmage_thunderbolt", "v2c_lightningmage_overcharge"],
  ["windmage", "바람 마법사", "v2c_windmage_tempest", "v2c_windmage_flow"],
  ["earthmage", "대지 마법사", "v2c_earthmage_tectonic", "v2c_earthmage_bedrock"],
] as const;

describe("다섯 원소 마법사 직업", () => {
  it("모두 마도사 계보의 tier 4 독립 직업이며 액티브+패시브 킷을 가진다", () => {
    for (const [jobId, name, activeId, passiveId] of ELEMENTAL_JOBS) {
      const job = V2_JOB_CATALOG[jobId];
      expect(job.name).toBe(name);
      expect(job.tier).toBe(4);
      expect(job.unlock.prereqs).toEqual({ magus: TIER4_UNLOCK_CUMLEVEL });
      expect(jobIdFromLegacy("mage", jobId)).toBe(jobId);
      expect(skillsForJob(jobId)).toEqual([activeId, passiveId]);
      expect(V2_SKILLS[activeId].category).toBe("attack");
      expect(V2_SKILLS[passiveId].category).toBe("passive");
    }
  });

  it("화염·냉기·전격·바람·대지가 서로 다른 전투 기믹을 가진다", () => {
    expect(V2_SKILLS.v2c_firemage_inferno.effects.map((e) => e.kind)).toEqual([
      "damage", "dot", "enemyHealReduce",
    ]);
    expect(V2_SKILLS.v2c_frostmage_glacier.effects.map((e) => e.kind)).toEqual([
      "damage", "shield", "enemyDelay",
    ]);
    expect(V2_SKILLS.v2c_lightningmage_thunderbolt.effects.map((e) => e.kind)).toEqual([
      "damage", "enemyVuln",
    ]);
    expect(V2_SKILLS.v2c_windmage_tempest.effects.map((e) => e.kind)).toEqual([
      "damage", "selfHaste",
    ]);
    expect(V2_SKILLS.v2c_earthmage_tectonic.effects.map((e) => e.kind)).toEqual([
      "damage", "enemyDelay", "shield",
    ]);
  });
});

describe("옛 원소술사 저장 호환", () => {
  it("옛 직업 선택은 화염 마법사로 해석하고 숙련도를 이관한다", () => {
    expect(jobIdFromLegacy("mage", "elementalist")).toBe("firemage");
    const parsed = parseProficiency({ jobCumLevel: { elementalist: 12345 } });
    expect(parsed.jobCumLevel?.firemage).toBe(12345);
    expect(parsed.jobCumLevel?.frostmage).toBeUndefined();
  });

  it("이미 배운 옛 원소술사 스킬은 세이브 호환을 위해 카탈로그에 보존한다", () => {
    expect(V2_SKILLS.v2c_elementalist_magic).toBeDefined();
    expect(V2_SKILLS.v2c_elementalist_mastery).toBeDefined();
    expect(skillsForJob("elementalist")).toEqual([]);
  });
});
