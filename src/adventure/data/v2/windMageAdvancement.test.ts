import { describe, expect, it } from "vitest";
import { emptyProficiency, effectiveCultivateProfile } from "./proficiency";
import { V2_JOB_CATALOG, LEGACY_CLASS_SPEC_BY_JOB, jobIdFromLegacy, isJobUnlocked } from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf, describeV2Skill } from "./v2Skills";

describe("바람 마법사 단일 계보", () => {
  it.each([
    ["aeromancer", "windmage", 18000, 5],
    ["stormbringer", "aeromancer", 35000, 6],
  ] as const)("%s는 직전 바람 직업 숙련도로 해금한다", (id, parent, threshold, tier) => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(job.tier).toBe(tier);
    expect(job.unlock.prereqs).toEqual({ [parent]: threshold });
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { elementallord: 999999, frostmage: 999999 } })).toBe(false);
  });
  it.each(["aeromancer", "stormbringer"])("%s를 저장·교관·수행에 연결한다", id => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: "mage", spec: id });
    expect(jobIdFromLegacy("mage", id)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(3);
    expect(elementalSkillsForClass("mage", id)).toEqual(kit);
    expect(effectiveCultivateProfile("mage", id)).toEqual(V2_JOB_CATALOG[id].cultivateProfile);
    expect(aggregateEquippedPassives(kit, id)).toEqual(aggregateEquippedPassives(kit, "warrior"));
  });
});

describe("기류 패시브", () => {
  it("장착한 기류 효과만 합산하며 직업에 의존하지 않는다", () => {
    expect(aggregateEquippedPassives(["v2c_aeromancer_current"], "warrior").windCurrentDamagePctPerStack).toBe(8);
    expect(aggregateEquippedPassives(["v2c_stormbringer_current"], "warrior").windCurrentDamagePctPerStack).toBe(12);
    expect(aggregateEquippedPassives(["v2c_aeromancer_current", "v2c_stormbringer_current"], "warrior").windCurrentDamagePctPerStack).toBe(20);
    expect(aggregateEquippedPassives(["v2c_aeromancer_spirit", "v2c_stormbringer_will"]).windCurrentDamagePctPerStack).toBeUndefined();
  });
  it("바람 주문의 순수 마법 계수와 독립 기류 패시브를 보존한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_aeromancer_blade).join(" ")).toContain("마법 공격력×2");
    expect(describeV2Skill(V2_SKILLS.v2c_stormbringer_burst).join(" ")).toContain("마법 공격력×3.5");
    expect(V2_SKILLS.v2c_aeromancer_spirit.passive).toEqual({windCurrentMpRestorePctPerStack:1,windCurrentShieldPctPerStack:5});
    expect(V2_SKILLS.v2c_stormbringer_will.passive).toEqual({windCurrentRebound:true,windCurrentReleaseEvades:1});
  });
});

describe("바람 스킬 비용", () => {
  it.each([
    ["v2c_aeromancer_blade",9], ["v2c_aeromancer_spirit",6], ["v2c_aeromancer_current",3],
    ["v2c_stormbringer_burst",16], ["v2c_stormbringer_will",6], ["v2c_stormbringer_current",5],
  ] as const)("%s의 효과를 공통 SP 산식에 반영한다", (id, sp) => {
    expect(spCostOf(V2_SKILLS[id])).toBe(sp);
  });
});

it("화염·바람 네 패시브를 함께 장착해도 범용 화력이 쌓이지 않는다", () => {
  const passive = aggregateEquippedPassives(["v2c_pyromancer_spirit","v2c_infernomancer_heart","v2c_aeromancer_spirit","v2c_stormbringer_will"],"warrior");
  expect(passive.statPct).toEqual({});
  expect(passive).toMatchObject({magicSkillDamagePct:0,maxMpPct:0,mpCostReductionPct:0});
});
