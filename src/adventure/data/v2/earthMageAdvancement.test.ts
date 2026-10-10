import { describe, expect, it } from "vitest";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";
import { emptyProficiency, effectiveCultivateProfile } from "./proficiency";
import { V2_JOB_CATALOG, LEGACY_CLASS_SPEC_BY_JOB, jobIdFromLegacy, isJobUnlocked } from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, describeV2Skill, V2_SKILLS, spCostOf } from "./v2Skills";

describe("대지 단일 계보", () => {
  it.each([
    ["geomancer", "earthmage", 18000],
    ["tectomancer", "geomancer", 35000],
  ] as const)("%s는 직전 대지 직업의 숙련도로만 해금한다", (id, parent, threshold) => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { elementallord: 999999, frostmage: 999999 } })).toBe(false);
  });

  it.each(["geomancer", "tectomancer"])("%s를 저장·교관·수행에 연결한다", id => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: "mage", spec: id });
    expect(jobIdFromLegacy("mage", id)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(3);
    expect(elementalSkillsForClass("mage", id)).toEqual(kit);
    expect(effectiveCultivateProfile("mage", id)).toEqual(V2_JOB_CATALOG[id].cultivateProfile);
    expect(aggregateEquippedPassives(kit, id)).toEqual(aggregateEquippedPassives(kit, "warrior"));
  });

  it("다른 직업의 저장 데이터에서도 두 보호막 패시브를 실제 전투로 전달한다", () => {
    function derive(equipped: string[]) {
      return derivePlayerCombatV2FromSaves({
        character: { class: "warrior", specChoice: "paladin", level: 50 },
        equipmentSave: {}, proficiencyRaw: {}, skillsRaw: { learned: equipped, equipped },
      })!.player;
    }
    expect(derive([]).skillShieldPowerPct).toBeUndefined();
    expect(derive([]).shieldedMagicSkillDamagePct).toBeUndefined();
    expect(derive(["v2c_geomancer_barrier", "v2c_tectomancer_ground"])).toMatchObject({ skillShieldPowerPct: 30, shieldedMagicSkillDamagePct: 20 });
  });

  it("태산의 의지는 물리·마법 방어력을 각각 18%만 올린다", () => {
    // defPct 는 물리·마법 방어력 양쪽에 붙으므로 magicDefPct 를 더하면 마법 방어력만 36%가 된다.
    expect(V2_SKILLS.v2c_tectomancer_resolve.passive).toMatchObject({ defPct: 18 });
    expect(V2_SKILLS.v2c_tectomancer_resolve.passive?.magicDefPct).toBeUndefined();
  });

  it("마나 실드를 피격 시 MP를 소모하는 것으로 설명하지 않는다", () => {
    for (const id of ["v2c_geomancer_barrier", "v2c_tectomancer_ground"] as const) {
      expect(JSON.stringify(V2_SKILLS[id].detail)).not.toContain("MP를 소모");
    }
  });

  it("능력치와 특화 패시브를 별도 비용으로 장착하고 조건을 표시한다", () => {
    const stats = aggregateEquippedPassives(["v2c_geomancer_heart", "v2c_tectomancer_resolve"]);
    expect(stats.statPct).toEqual({ int: 45, spi: 15 });
    expect(stats).toMatchObject({ maxHpPct: 28, defPct: 18, magicDefPct: 0, skillShieldPowerPct: 0, shieldedMagicSkillDamagePct: 0 });
    expect(spCostOf(V2_SKILLS.v2c_geomancer_heart)).toBe(8);
    expect(spCostOf(V2_SKILLS.v2c_tectomancer_resolve)).toBe(11);
    expect(spCostOf(V2_SKILLS.v2c_geomancer_barrier)).toBe(4);
    expect(spCostOf(V2_SKILLS.v2c_tectomancer_ground)).toBe(4);
    expect(describeV2Skill(V2_SKILLS.v2c_geomancer_barrier).join(" ")).toContain("스킬 보호막 생성량 +30%");
    expect(describeV2Skill(V2_SKILLS.v2c_tectomancer_ground).join(" ")).toContain("보호막 유지 중 직접 마법 스킬 피해 +20%");
    expect(describeV2Skill(V2_SKILLS.v2c_tectomancer_cataclysm).join(" ")).toContain("시전 전 보호막이 있으면 직접 마법 피해 +20%");
  });
});
