import { describe, expect, it } from "vitest";
import {
  classifySkillForLibrary,
  matchesSkillDamageType,
  matchesSkillLibraryClassification,
  skillDamageTypes,
} from "./skillLibraryFilters";

describe("스킬 보유 목록 차수·계열 분류", () => {
  it.each([
    ["v2_skill_strike", { tier: "common", lineage: "common" }],
    ["v2c_none_toughness", { tier: "common", lineage: "common" }],
    ["v2c_warrior_strike", { tier: "1", lineage: "warrior" }],
    ["v2c_swordsaint_flash", { tier: "6", lineage: "warrior" }],
    ["v2c_elementalist_magic", { tier: "4", lineage: "mage" }],
    ["v2c_farmer_seedselection", { tier: "2", lineage: "survivor" }],
  ] as const)("%s의 출처 직업을 사용자 분류로 바꾼다", (skillId, expected) => {
    expect(classifySkillForLibrary(skillId)).toEqual(expected);
  });

  it("차수와 계열 조건을 모두 만족해야 표시한다", () => {
    expect(
      matchesSkillLibraryClassification(
        "v2c_swordsaint_flash",
        "6",
        "warrior",
      ),
    ).toBe(true);
    expect(
      matchesSkillLibraryClassification(
        "v2c_swordsaint_flash",
        "5",
        "warrior",
      ),
    ).toBe(false);
    expect(
      matchesSkillLibraryClassification(
        "v2c_swordsaint_flash",
        "6",
        "mage",
      ),
    ).toBe(false);
  });

  it.each([
    ["v2c_mutant_morphstrike", "1"],
    ["v2c_beastwarrior_reopen", "2"],
    ["v2c_tracker_pounce", "3"],
    ["v2c_bloodtracker_trailslash", "4"],
    ["v2c_predator_devour", "5"],
    ["v2c_primalpredator_primalfeast", "6"],
  ] as const)("%s를 변이자 %s차 검색 결과에 포함한다", (skillId, tier) => {
    expect(classifySkillForLibrary(skillId)).toEqual({
      tier,
      lineage: "mutant",
    });
    expect(matchesSkillLibraryClassification(skillId, tier, "all")).toBe(
      true,
    );
  });

  it("알 수 없는 스킬은 전체 보기에서만 보존한다", () => {
    expect(
      matchesSkillLibraryClassification("legacy_unknown", "all", "all"),
    ).toBe(true);
    expect(
      matchesSkillLibraryClassification("legacy_unknown", "1", "all"),
    ).toBe(false);
    expect(
      matchesSkillLibraryClassification("legacy_unknown", "all", "warrior"),
    ).toBe(false);
  });
});

describe("스킬 보유 목록 피해 유형 분류", () => {
  it.each([
    ["v2_skill_strike", ["physical"]],
    ["v2c_mage_fireball", ["magic", "burn"]],
    ["v2c_venomist_virulence", ["poison"]],
    ["v2c_archmage_theory", ["magic"]],
    ["v2c_swordsaint_transcendence", ["physical"]],
    ["v2c_dragonlord_heart", ["physical", "magic", "burn"]],
    ["v2c_lawweaver_release", ["magic"]],
    ["v2c_archbishop_sanctuary", []],
  ] as const)("%s의 피해 유형을 데이터에서 판별한다", (skillId, expected) => {
    expect(skillDamageTypes(skillId)).toEqual(expected);
  });

  it("독침은 중독, 찢어발기기와 출혈 추적 스킬은 출혈로 분류한다", () => {
    expect(skillDamageTypes("v2c_rogue_poison")).toContain("poison");
    expect(skillDamageTypes("v2c_beastkin_rend")).toContain("bleed");
    expect(skillDamageTypes("v2c_beastwarrior_reopen")).toContain("bleed");
    expect(skillDamageTypes("v2c_beastkin_bloodscent")).toEqual([
      "physical",
      "bleed",
    ]);
  });

  it("마법 방어 패시브는 마법 공격으로 분류하지 않는다", () => {
    expect(skillDamageTypes("v2c_spellsealer_greatward")).not.toContain(
      "magic",
    );
  });

  it("전체 유형은 모든 스킬을, 특정 유형은 해당 스킬만 표시한다", () => {
    expect(matchesSkillDamageType("legacy_unknown", "all")).toBe(true);
    expect(matchesSkillDamageType("legacy_unknown", "poison")).toBe(false);
    expect(matchesSkillDamageType("v2c_mage_fireball", "burn")).toBe(true);
    expect(matchesSkillDamageType("v2c_mage_fireball", "physical")).toBe(
      false,
    );
  });
});
