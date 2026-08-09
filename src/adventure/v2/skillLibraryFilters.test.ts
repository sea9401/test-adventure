import { describe, expect, it } from "vitest";
import {
  classifySkillForLibrary,
  matchesSkillLibraryClassification,
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
