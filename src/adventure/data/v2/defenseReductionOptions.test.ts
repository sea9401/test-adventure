import { describe, expect, it } from "vitest";

import { buildTagsForSkill } from "./buildTags";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  describeV2Skill,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";

const SWORD_LINE = [
  "v2c_veteran_armorinsight",
  "v2c_swordmaster_armorinsight2",
  "v2c_swordsaint_armorinsight3",
] as const satisfies readonly V2SkillId[];

const FIST_LINE = [
  "v2c_sensei_formationbreak",
  "v2c_dragonfist_formationbreak2",
  "v2c_celestialdragon_formationbreak3",
] as const satisfies readonly V2SkillId[];

const SHADOW_LINE = [
  "v2c_phantom_weakpoint",
  "v2c_nightshade_weakpoint2",
  "v2c_blackmoon_weakpoint3",
] as const satisfies readonly V2SkillId[];

const ARCHMAGE_LINE = [
  "v2c_sage_magicdismantle",
  "v2c_arcanist_magicdismantle2",
  "v2c_archmage_magicdismantle3",
] as const satisfies readonly V2SkillId[];

describe("타 직업 방어 감소 선택지", () => {
  it("네 계보의 방어 감소율과 SP 비용이 설계값과 일치한다", () => {
    const physicalValues = [SWORD_LINE, FIST_LINE, SHADOW_LINE].map((ids) =>
      ids.map(
        (id) => V2_SKILLS[id].passive?.enemyPhysicalDefReductionPct,
      ),
    );
    const magicValues = ARCHMAGE_LINE.map(
      (id) => V2_SKILLS[id].passive?.enemyMagicDefReductionPct,
    );

    expect(physicalValues).toEqual([
      [3, 4, 5],
      [2, 3, 4],
      [2, 3, 4],
    ]);
    expect(magicValues).toEqual([3, 4, 5]);
    expect(
      [SWORD_LINE, FIST_LINE, SHADOW_LINE].map((ids) =>
        ids.map((id) => spCostOf(V2_SKILLS[id])),
      ),
    ).toEqual([
      [5, 7, 9],
      [3, 5, 7],
      [3, 5, 7],
    ]);
    expect(ARCHMAGE_LINE.map((id) => spCostOf(V2_SKILLS[id]))).toEqual([
      5, 7, 9,
    ]);
  });

  it("같은 종류의 감소율을 남은 방어력 기준으로 곱연산한다", () => {
    expect(
      aggregateEquippedPassives(SWORD_LINE).enemyPhysicalDefReductionPct,
    ).toBeCloseTo(11.536);
    expect(
      aggregateEquippedPassives(FIST_LINE).enemyPhysicalDefReductionPct,
    ).toBeCloseTo(8.7424);
    expect(
      aggregateEquippedPassives(SHADOW_LINE).enemyPhysicalDefReductionPct,
    ).toBeCloseTo(8.7424);
    expect(
      aggregateEquippedPassives([
        ...SWORD_LINE,
        ...FIST_LINE,
        ...SHADOW_LINE,
      ]).enemyPhysicalDefReductionPct,
    ).toBeCloseTo(26.3276270322);
    expect(
      aggregateEquippedPassives(ARCHMAGE_LINE).enemyMagicDefReductionPct,
    ).toBeCloseTo(11.536);
  });

  it("스킬 설명과 빌드 검색 태그에 방어 감소를 노출한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_veteran_armorinsight)).toContain(
      "적 물리 방어 -3%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_sage_magicdismantle)).toContain(
      "적 마법 방어 -3%",
    );
    expect(
      buildTagsForSkill(V2_SKILLS.v2c_veteran_armorinsight),
    ).toContain("vulnerability");
    expect(buildTagsForSkill(V2_SKILLS.v2c_sage_magicdismantle)).toEqual(
      expect.arrayContaining(["magic", "vulnerability"]),
    );
  });

  it("각 패시브를 승인된 직업의 세 번째 학습 선택지로 제공한다", () => {
    const placements: ReadonlyArray<readonly [string, V2SkillId]> = [
      ["veteran", SWORD_LINE[0]],
      ["swordmaster", SWORD_LINE[1]],
      ["swordsaint", SWORD_LINE[2]],
      ["sensei", FIST_LINE[0]],
      ["dragonfist", FIST_LINE[1]],
      ["celestialdragon", FIST_LINE[2]],
      ["phantom", SHADOW_LINE[0]],
      ["nightshade", SHADOW_LINE[1]],
      ["blackmoon", SHADOW_LINE[2]],
      ["sage", ARCHMAGE_LINE[0]],
      ["arcanist", ARCHMAGE_LINE[1]],
      ["archmage", ARCHMAGE_LINE[2]],
    ];

    for (const [jobId, skillId] of placements) {
      expect(skillsForJob(jobId).at(-1), jobId).toBe(skillId);
      expect(V2_SKILLS[skillId].category, skillId).toBe("passive");
    }
  });
});
