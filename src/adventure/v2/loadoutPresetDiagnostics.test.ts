import { describe, expect, it } from "vitest";
import {
  autoFitLoadoutPreset,
  diagnoseLoadoutPreset,
  toggleLoadoutPresetDraftSkill,
  type LoadoutPresetSkillMeta,
} from "./loadoutPresetDiagnostics";
import { V2_SKILLS, spCostOf, type V2SkillId } from "@/adventure/data/v2/v2Skills";

const library: LoadoutPresetSkillMeta[] = [
  { skillId: "skill-a", name: "선봉 기술", spCost: 30 },
  { skillId: "skill-b", name: "중심 기술", spCost: 20 },
  { skillId: "skill-c", name: "후순위 기술", spCost: 17 },
];

const primordialCatalyst = [
  "v2c_firemage_inferno",
  "v2c_frostmage_glacier",
  "v2c_lightningmage_thunderbolt",
  "v2c_windmage_tempest",
  "v2c_earthmage_tectonic",
  "v2c_primordialmage_return",
  "v2c_primordialmage_resonance",
  "v2c_elementallord_surge",
] as const satisfies readonly V2SkillId[];

const primordialLibrary: LoadoutPresetSkillMeta[] = primordialCatalyst.map((skillId) => ({
  skillId,
  name: V2_SKILLS[skillId].name,
  spCost: spCostOf(V2_SKILLS[skillId]),
}));

describe("프리셋 SP 진단", () => {
  it("현재 비용으로 필요한 SP와 초과분을 계산한다", () => {
    const diagnosis = diagnoseLoadoutPreset(
      ["skill-a", "skill-b", "skill-c"],
      library,
      60,
    );

    expect(diagnosis).toMatchObject({
      spUsed: 67,
      spBudget: 60,
      overBy: 7,
      canApply: false,
    });
    expect(diagnosis.rows.map((row) => [row.name, row.spCost, row.status])).toEqual([
      ["선봉 기술", 30, "learned"],
      ["중심 기술", 20, "learned"],
      ["후순위 기술", 17, "learned"],
    ]);
  });

  it("현재 배우지 않은 스킬과 카탈로그에 없는 스킬을 구분한다", () => {
    const diagnosis = diagnoseLoadoutPreset(
      ["skill-a", "v2_skill_recover", "legacy_deleted_skill"],
      library,
      99,
    );

    expect(diagnosis.canApply).toBe(false);
    expect(diagnosis.rows).toEqual([
      {
        skillId: "skill-a",
        name: "선봉 기술",
        spCost: 30,
        status: "learned",
      },
      {
        skillId: "v2_skill_recover",
        name: "회복",
        spCost: 3,
        status: "notLearned",
      },
      {
        skillId: "legacy_deleted_skill",
        name: "legacy_deleted_skill",
        spCost: 0,
        status: "unknown",
      },
    ]);
  });

  it("예산과 학습 상태가 모두 맞으면 바로 적용할 수 있다", () => {
    expect(
      diagnoseLoadoutPreset(["skill-a", "skill-b"], library, 50),
    ).toMatchObject({ spUsed: 50, overBy: 0, canApply: true });
  });

  it("근원 촉매 구성의 유효 비용과 31 SP 총액을 표시한다", () => {
    const diagnosis = diagnoseLoadoutPreset(
      primordialCatalyst,
      primordialLibrary,
      31,
    );

    expect(diagnosis).toMatchObject({ spUsed: 31, overBy: 0, canApply: true });
    expect(
      diagnosis.rows.find((row) => row.skillId === "v2c_firemage_inferno"),
    ).toMatchObject({ spCost: 8, effectiveSpCost: 1 });
    expect(
      diagnosis.rows.find((row) => row.skillId === "v2c_elementallord_surge"),
    ).toMatchObject({ spCost: 16, effectiveSpCost: 1 });
  });
});

describe("프리셋 자동 맞춤", () => {
  it("유효하지 않은 항목을 제거하고 후순위 스킬부터 빼서 예산을 맞춘다", () => {
    const skills = [
      "skill-a",
      "v2_skill_recover",
      "skill-b",
      "skill-c",
      "legacy_deleted_skill",
    ];

    const fitted = autoFitLoadoutPreset(skills, library, 50);

    expect(fitted).toEqual({
      skills: ["skill-a", "skill-b"],
      removed: ["v2_skill_recover", "legacy_deleted_skill", "skill-c"],
      spUsed: 50,
      spBudget: 50,
    });
    expect(skills).toEqual([
      "skill-a",
      "v2_skill_recover",
      "skill-b",
      "skill-c",
      "legacy_deleted_skill",
    ]);
  });

  it("이미 적용 가능한 프리셋은 그대로 둔다", () => {
    expect(
      autoFitLoadoutPreset(["skill-a", "skill-b"], library, 60),
    ).toEqual({
      skills: ["skill-a", "skill-b"],
      removed: [],
      spUsed: 50,
      spBudget: 60,
    });
  });

  it("후순위 촉매 제거 뒤 공명 총액을 다시 계산해 나머지 회로를 보존한다", () => {
    expect(autoFitLoadoutPreset(primordialCatalyst, primordialLibrary, 30)).toEqual({
      skills: primordialCatalyst.slice(0, -1),
      removed: ["v2c_elementallord_surge"],
      spUsed: 30,
      spBudget: 30,
    });
  });
});

describe("프리셋 직접 조정", () => {
  it("스킬을 다시 포함하면 저장된 원래 우선순위로 복원한다", () => {
    const saved = ["skill-a", "skill-b", "skill-c"];
    const draft = ["skill-a", "skill-c"];

    expect(toggleLoadoutPresetDraftSkill(saved, draft, "skill-b")).toEqual([
      "skill-a",
      "skill-b",
      "skill-c",
    ]);
    expect(saved).toEqual(["skill-a", "skill-b", "skill-c"]);
    expect(draft).toEqual(["skill-a", "skill-c"]);
  });

  it("포함된 스킬을 체크 해제하면 해당 스킬만 제거한다", () => {
    expect(
      toggleLoadoutPresetDraftSkill(
        ["skill-a", "skill-b", "skill-c"],
        ["skill-a", "skill-b", "skill-c"],
        "skill-b",
      ),
    ).toEqual(["skill-a", "skill-c"]);
  });
});
