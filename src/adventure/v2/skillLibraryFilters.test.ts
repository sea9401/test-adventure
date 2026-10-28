import { describe, expect, it } from "vitest";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import {
  classifySkillForLibrary,
  matchesSkillDamageType,
  matchesSkillJob,
  matchesSkillLibraryClassification,
  skillDamageTypes,
  skillJobFilterGroups,
  skillSourceJob,
  orderSkillEnhanceRows,
  skillSourceJobLabel,
} from "./skillLibraryFilters";

describe("스킬 보유 목록 차수·계열 분류", () => {
  it.each([
    ["v2_skill_strike", { tier: "common", lineage: "common" }],
    ["v2c_none_toughness", { tier: "common", lineage: "common" }],
    ["v2c_warrior_strike", { tier: "1", lineage: "warrior" }],
    ["v2c_swordsaint_flash", { tier: "6", lineage: "warrior" }],
    ["v2c_elementalist_magic", { tier: "4", lineage: "mage" }],
    ["v2c_farmer_seedselection", { tier: "2", lineage: "survivor" }],
    ["v2c_dreadnought_armor", { tier: "7", lineage: "warrior" }],
    ["v2c_tempest_crown", { tier: "7", lineage: "mage" }],
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

describe("스킬 보유 목록 출처 직업", () => {
  it.each([
    ["v2c_warrior_strike", "warrior", "견습 병사"],
    ["v2c_fortressknight_citadel", "fortressknight", "성채기사"],
    ["v2c_dreadnought_armor", "dreadnought", "드레드노트"],
  ] as const)("%s의 출처 직업 이름을 알려 준다", (skillId, jobId, name) => {
    expect(skillSourceJob(skillId)).toMatchObject({ id: jobId, name });
    expect(skillSourceJobLabel(skillId)).toBe(name);
  });

  it("공용 스킬은 직업 대신 공용으로 표시한다", () => {
    expect(skillSourceJob("v2_skill_strike")).toBeNull();
    expect(skillSourceJobLabel("v2_skill_strike")).toBe("공용");
    expect(skillSourceJobLabel("v2c_none_toughness")).toBe("공용");
    expect(skillSourceJobLabel("legacy_unknown")).toBeNull();
  });

  it("직업을 고르면 그 직업 스킬만 남긴다", () => {
    expect(matchesSkillJob("v2c_dreadnought_armor", "dreadnought", false)).toBe(true);
    expect(matchesSkillJob("v2c_fortressknight_citadel", "dreadnought", false)).toBe(false);
    expect(matchesSkillJob("v2_skill_strike", "dreadnought", false)).toBe(false);
    expect(matchesSkillJob("v2_skill_strike", "all", false)).toBe(true);
  });

  it("이전 차수 계보를 포함하면 7차 직업의 두 선행 계보 스킬을 모두 남긴다", () => {
    for (const skillId of [
      "v2c_dreadnought_armor",
      "v2c_fortressknight_citadel",
      "v2c_vajraarhat_body",
      "v2c_shieldman_bash",
      "v2c_monk_palm",
      "v2c_warrior_strike",
    ]) {
      expect(matchesSkillJob(skillId, "dreadnought", true)).toBe(true);
    }
    expect(matchesSkillJob("v2c_lawguardian_domain", "dreadnought", true)).toBe(false);
    expect(matchesSkillJob("v2c_squire_might", "dreadnought", true)).toBe(false);
    expect(matchesSkillJob("v2c_mage_fireball", "dreadnought", true)).toBe(false);
    expect(matchesSkillJob("v2_skill_strike", "dreadnought", true)).toBe(false);
  });

  it("직업 선택지는 보유 스킬의 직업과 현재 직업을 차수별로 묶는다", () => {
    const groups = skillJobFilterGroups(
      ["v2c_fortressknight_citadel", "v2c_warrior_strike", "v2c_warrior_might", "v2_skill_strike"],
      ["dreadnought"],
    );
    expect(groups).toEqual([
      { label: "1차", jobs: [{ id: "warrior", name: "견습 병사" }] },
      { label: "6차", jobs: [{ id: "fortressknight", name: "성채기사" }] },
      { label: "7차", jobs: [{ id: "dreadnought", name: "드레드노트" }] },
    ]);
  });
});

describe("스킬 강화 목록 장착 우선·검색", () => {
  const rows = (
    [
      "v2c_warrior_strike",
      "v2c_swordsaint_flash",
      "v2c_elementalist_magic",
      "v2_skill_strike",
    ] as const
  ).map((skillId) => ({ skillId, name: V2_SKILLS[skillId].name }));
  const flashName = V2_SKILLS.v2c_swordsaint_flash.name;

  it("장착 스킬을 장착 순서대로 먼저 두고 나머지는 원래 순서를 지킨다", () => {
    const ordered = orderSkillEnhanceRows(
      rows,
      ["v2c_elementalist_magic", "v2c_warrior_strike"],
      "",
    );
    expect(ordered.map((r) => r.skillId)).toEqual([
      "v2c_elementalist_magic",
      "v2c_warrior_strike",
      "v2c_swordsaint_flash",
      "v2_skill_strike",
    ]);
  });

  it("목록에 없는 장착 id는 무시한다", () => {
    const ordered = orderSkillEnhanceRows(rows, ["unknown_skill"], "");
    expect(ordered.map((r) => r.skillId)).toEqual(rows.map((r) => r.skillId));
  });

  it("띄어쓴 검색어를 모두 포함하는 스킬만 남긴다", () => {
    expect(
      orderSkillEnhanceRows(rows, [], `  ${flashName} `).map((r) => r.skillId),
    ).toEqual(["v2c_swordsaint_flash"]);
    expect(
      orderSkillEnhanceRows(rows, [], `${flashName} 없는검색어`),
    ).toEqual([]);
  });

  it("출처 직업 이름으로도 찾는다", () => {
    const job = skillSourceJobLabel("v2c_swordsaint_flash")!;
    expect(
      orderSkillEnhanceRows(rows, [], job).map((r) => r.skillId),
    ).toContain("v2c_swordsaint_flash");
  });

  it("검색 결과 안에서도 장착 스킬이 먼저 온다", () => {
    const ordered = orderSkillEnhanceRows(
      rows,
      ["v2_skill_strike"],
      "공용",
    );
    expect(ordered[0]?.skillId).toBe("v2_skill_strike");
  });
});
