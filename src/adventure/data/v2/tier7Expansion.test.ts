import { describe, expect, it } from "vitest";
import { elementalSkillsForClass, parseV2Class } from "./classes";
import { emptyProficiency } from "./proficiency";
import { isJobContentUnlocked, isJobUnlocked, jobIdFromLegacy, LEGACY_CLASS_SPEC_BY_JOB, unlockedJobCount, V2_JOB_CATALOG } from "./v2JobCatalog";
import { spendTier7FirstUnlockMaterial, tier7AdvancementStatus } from "./tier7Advancement";
import { skillsForJob } from "./v2SkillsByJob";
import { rebalanceDynamicV2SkillEffects, skillPowerScore, spCostOf, V2_SKILLS } from "./v2Skills";

const jobs = [
  ["aegis", "fortressknight", "lawguardian"],
  ["seraphim", "savior", "dawnpaladin"],
  ["dragonlord", "dragonsovereign", "infernomancer"],
] as const;

describe("7차 이지스·세라핌·드래곤로드 공개", () => {
  it.each(jobs)("%s 최초 전직은 두 선행 직업과 재료를 검증하고 이력 이후에만 집계한다", (id, first, second) => {
    const input = { targetJobId: id, currentJobId: first, currentLevel: 100, jobCumLevel: { [first]: 100_000, [second]: 100_000 }, jobHistory: [] as string[], materials: { v2_storm_origin_fragment: 30 } };
    const status = tier7AdvancementStatus(input);
    expect(status?.firstUnlockReady).toBe(true);
    expect(spendTier7FirstUnlockMaterial(input.materials, status!)).toEqual({});
    expect(tier7AdvancementStatus({ ...input, jobCumLevel: { [first]: 100_000, [second]: 99_999 } })?.failure).toBe("tier7_prerequisite_proficiency");
    expect(tier7AdvancementStatus({ ...input, materials: {} })?.failure).toBe("tier7_material_shortage");
    expect(tier7AdvancementStatus({ ...input, currentLevel: 99 })?.failure).toBe("level_too_low");
    expect(tier7AdvancementStatus({ ...input, currentJobId: "none" })?.failure).toBe("tier7_current_job");
    expect(tier7AdvancementStatus({ ...input, jobHistory: [id], materials: {}, jobCumLevel: {}, currentJobId: "none" })?.permanentlyUnlocked).toBe(true);

    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    const proficiency = { ...emptyProficiency(), jobCumLevel: input.jobCumLevel };
    expect(isJobUnlocked(job, proficiency)).toBe(true);
    expect(isJobContentUnlocked(job, proficiency)).toBe(false);
    const before = unlockedJobCount(proficiency);
    proficiency.jobHistory = [id];
    expect(isJobContentUnlocked(job, proficiency)).toBe(true);
    expect(unlockedJobCount(proficiency)).toBe(before + 1);
    const legacy = LEGACY_CLASS_SPEC_BY_JOB[id];
    expect(jobIdFromLegacy(legacy.class, legacy.spec)).toBe(id);
    expect(Object.values(job.cultivateProfile).reduce((a, b) => a + b, 0)).toBe(7);
    expect(Object.values(job.jobBonus).reduce((a, b) => a + b, 0)).toBe(48);
  });

  it.each(jobs)("%s 전직 시 두 액티브와 패시브를 학습하며 7차 보정을 적용한다", (id, first, second) => {
    const skills = skillsForJob(id);
    expect(skills).toHaveLength(3);
    const legacy = LEGACY_CLASS_SPEC_BY_JOB[id];
    expect(elementalSkillsForClass(parseV2Class(legacy.class), legacy.spec)).toEqual(skills);
    for (const parentId of [first, second]) {
      const parent = LEGACY_CLASS_SPEC_BY_JOB[parentId];
      const learnable = elementalSkillsForClass(parseV2Class(parent.class), parent.spec);
      for (const skill of skills) expect(learnable).not.toContain(skill);
    }
    expect(skills.map((skill) => V2_SKILLS[skill]).filter((skill) => skill.category === "passive")).toHaveLength(1);
    expect(skills.reduce((sum, skill) => sum + spCostOf(V2_SKILLS[skill]), 0)).toBe(46);
    const score = skills.reduce((sum, skill) => sum + skillPowerScore(V2_SKILLS[skill]), 0);
    expect(score).toBeGreaterThanOrEqual(16);
    expect(score).toBeLessThanOrEqual(18);
    for (const skill of skills) expect(rebalanceDynamicV2SkillEffects(skill, [{ kind: "damage", statCoef: 2 }])).toEqual([{ kind: "damage", statCoef: 2 }]);
  });
});
