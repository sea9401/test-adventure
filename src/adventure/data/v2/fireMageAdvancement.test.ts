import { describe, expect, it } from "vitest";
import { emptyProficiency, effectiveCultivateProfile } from "./proficiency";
import { V2_JOB_CATALOG, LEGACY_CLASS_SPEC_BY_JOB, jobIdFromLegacy, isJobUnlocked } from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf } from "./v2Skills";

describe("화염 마법사 단일 계보", () => {
  it.each([
    ["pyromancer", "firemage", 18000, 5],
    ["infernomancer", "pyromancer", 35000, 6],
  ] as const)("%s는 직전 화염 직업 숙련도로 해금한다", (id, parent, threshold, tier) => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(job.tier).toBe(tier);
    expect(job.unlock.prereqs).toEqual({ [parent]: threshold });
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { elementallord: 999999, frostmage: 999999 } })).toBe(false);
  });
  it.each(["pyromancer", "infernomancer"])("%s를 저장·교관·수행에 연결한다", id => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: "mage", spec: id });
    expect(jobIdFromLegacy("mage", id)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(3);
    expect(elementalSkillsForClass("mage", id)).toEqual(kit);
    expect(effectiveCultivateProfile("mage", id)).toEqual(V2_JOB_CATALOG[id].cultivateProfile);
    expect(aggregateEquippedPassives(kit, id)).toEqual(aggregateEquippedPassives(kit, "warrior"));
  });
});

describe("화염 고차 속성 패시브", () => {
  it("능력치 중첩 대신 연소 유지와 재점화를 제공한다", () => {
    expect(V2_SKILLS.v2c_pyromancer_spirit.passive).toEqual({burnDurationBonusTurns:1,fireSpellMpCostReductionPct:20});
    expect(V2_SKILLS.v2c_infernomancer_heart.passive).toEqual({burnRekindle:true,fireBurstShieldPctMaxMp:20});
    const passive = aggregateEquippedPassives(["v2c_pyromancer_spirit","v2c_infernomancer_heart"], "warrior");
    expect(passive.statPct).toEqual({});
    expect(passive).toMatchObject({magicSkillDamagePct:0,maxMpPct:0,mpCostReductionPct:0,burnDurationBonusTurns:1,burnRekindle:true});
    expect(spCostOf(V2_SKILLS.v2c_pyromancer_spirit)).toBe(5);
    expect(spCostOf(V2_SKILLS.v2c_infernomancer_heart)).toBe(5);
  });
});

describe("독립 연소 패시브", () => {
  it.each([
    ["pyromancer", "v2c_pyromancer_burn", 30],
    ["infernomancer", "v2c_infernomancer_burn", 50],
  ] as const)("%s에서 연소 피해만 별도로 배워 장착한다", (job, id, pct) => {
    expect(skillsForJob(job)).toContain(id);
    expect(V2_SKILLS[id]?.passive).toEqual({ burnDamagePct: pct });
    expect(aggregateEquippedPassives([id], "warrior").burnDamagePct).toBe(pct);
    expect(aggregateEquippedPassives([id], job)).toEqual(aggregateEquippedPassives([id], "warrior"));
  });
});
