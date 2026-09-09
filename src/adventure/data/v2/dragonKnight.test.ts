import { describe, expect, it } from "vitest";
import { V2_JOB_CATALOG, LEGACY_CLASS_SPEC_BY_JOB, isJobUnlocked, jobIdFromLegacy, TIER3_UNLOCK_CUMLEVEL, TIER4_UNLOCK_CUMLEVEL, TIER5_UNLOCK_CUMLEVEL, TIER6_UNLOCK_CUMLEVEL } from "./v2JobCatalog";
import { addPoints, applyCultivation, emptyProficiency } from "./proficiency";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, describeV2Skill, spCostOf, V2_SKILLS } from "./v2Skills";

describe("기사×수인 용기사", () => {
  it("기사와 수인의 개별 숙련도를 모두 요구하고 직군 숙련도로 우회하지 못한다", () => {
    const job = V2_JOB_CATALOG.dragonknight;
    expect(job).toBeDefined();
    const partialLevels: Record<string, number>[] = [{ paladin: 2500 }, { beastkin: 2500 }, { paladin: 2500, beastkin: 2499 }];
    for (const levels of partialLevels) {
      expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: levels })).toBe(false);
    }
    const groups = emptyProficiency();
    groups.groups.warrior = { cumLevel: 999999, tier: 1, cultivations: 0 };
    groups.groups.mutant = { cumLevel: 999999, tier: 1, cultivations: 0 };
    expect(isJobUnlocked(job, groups)).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { paladin: TIER3_UNLOCK_CUMLEVEL, beastkin: TIER3_UNLOCK_CUMLEVEL } })).toBe(true);
  });
  it.each([
    ["drakeblood", "dragonknight", TIER4_UNLOCK_CUMLEVEL],
    ["dragonwing", "drakeblood", TIER5_UNLOCK_CUMLEVEL],
    ["dragonsovereign", "dragonwing", TIER6_UNLOCK_CUMLEVEL],
  ] as const)("%s는 직전 직업 %s의 숙련도 경계를 따른다", (id, parent, threshold) => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
  });
  it.each(["dragonknight", "drakeblood", "dragonwing", "dragonsovereign"])("%s는 저장·교관·수행·범용 패시브까지 연결된다", id => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: "warrior", spec: id });
    expect(jobIdFromLegacy("warrior", id)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(2);
    expect(elementalSkillsForClass("warrior", id)).toEqual(kit);
    const grown = applyCultivation(addPoints(emptyProficiency(), "warrior", 10000), "warrior", undefined, undefined, id);
    expect(grown?.next.caps).toMatchObject(V2_JOB_CATALOG[id].cultivateProfile);
    const portable = aggregateEquippedPassives(kit, "templar");
    expect(aggregateEquippedPassives(kit)).toEqual(portable);
    expect(aggregateEquippedPassives(kit, id)).toEqual(portable);
    expect(describeV2Skill(V2_SKILLS[kit[1]]).join(" ")).not.toContain("용기사 계열");
  });
});

const passives = ["v2c_dragonknight_blood", "v2c_drakeblood_scales", "v2c_dragonwing_spirit", "v2c_dragonsovereign_heart"] as const;
describe("용기사 범용 패시브 옵션", () => {
  it("다른 직업에서도 기본 옵션을 모두 제공한다", () => {
    const result = aggregateEquippedPassives(passives, "mage");
    expect(result.statPct).toMatchObject({ str: 62, vit: 48 });
    expect(result).toMatchObject({ accuracyPct: 0, critDmgPct: 25, skillCritDmgPct: 15, maxHpPct: 20, damageTakenReductionPct: 8, defPct: 10 });
    expect(passives.map(id => spCostOf(V2_SKILLS[id]))).toEqual([4, 4, 6, 14]);
  });
  it.each(["dragonknight", "drakeblood", "dragonwing", "dragonsovereign"])("%s에서도 다른 직업과 동일한 옵션을 제공한다", id => {
    expect(aggregateEquippedPassives(passives, id)).toMatchObject({ accuracyPct: 0, critDmgPct: 25, skillCritDmgPct: 15, maxHpPct: 20, damageTakenReductionPct: 8, defPct: 10 });
    expect(aggregateEquippedPassives(passives, id)).toEqual(aggregateEquippedPassives(passives));
    expect(aggregateEquippedPassives([], id)).toEqual(aggregateEquippedPassives([]));
  });
  it.each(["paladin", "beastkin", "dragonstriker", "transcendent", "dawnpaladin"])("%s는 용기사 계열로 간주하지 않는다", id => {
    expect(aggregateEquippedPassives(passives, id)).toEqual(aggregateEquippedPassives(passives));
  });
});
