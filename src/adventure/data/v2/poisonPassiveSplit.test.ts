import { describe, expect, it } from "vitest";

import {
  V2_SKILLS,
  aggregateEquippedPassives,
  describeV2Skill,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";
import { skillsForJob } from "./v2SkillsByJob";

const VIRULENCE = [
  ["venomist", "v2c_venomist_virulence", "맹독 I", 24.4, 4],
  ["venomancer", "v2c_venomancer_virulence2", "맹독 II", 24.4, 4],
  ["venomlord", "v2c_venomlord_virulence3", "맹독 III", 24.4, 4],
  ["plaguebringer", "v2c_plaguebringer_virulence4", "맹독 IV", 24.4, 6],
] as const;

const CORROSION = [
  ["v2c_venomist_corrosion", 6, 4],
  ["v2c_venomancer_corrosion3", 7, 4],
  ["v2c_venomlord_sovereign", 9, 4],
  ["v2c_plaguebringer_decay", 12, 6],
  ["v2c_myriadvenom_body", 14, 11],
] as const;

describe("독술 계보 맹독·부식 분리", () => {
  it("하위 네 직업은 기존 부식과 별개인 맹독 패시브를 마지막 학습 선택지로 제공한다", () => {
    for (const [jobId, skillId, name, poisonDamagePct, spCost] of VIRULENCE) {
      const skill = V2_SKILLS[skillId as V2SkillId];

      expect(skill, skillId).toBeDefined();
      expect(skill.name).toBe(name);
      expect(skill.category).toBe("passive");
      expect(skill.passive?.poisonDamagePct).toBe(poisonDamagePct);
      expect(spCostOf(skill)).toBe(spCost);
      expect(skillsForJob(jobId).at(-1)).toBe(skillId);
      expect(describeV2Skill(skill)).toContain(`중독 피해 +${poisonDamagePct}%`);
    }
  });

  it("맹독 네 단계와 만독지배를 모두 장착하면 중독 피해가 총 122% 증가한다", () => {
    const ids = [
      ...VIRULENCE.map(([, id]) => id),
      "v2c_myriadvenom_body",
    ] as V2SkillId[];

    expect(aggregateEquippedPassives(ids).poisonDamagePct).toBe(122);
  });

  it("부식 다섯 단계는 약 39.8%를 곱연산하고 기존 SP 비용을 유지한다", () => {
    const ids = CORROSION.map(([id]) => id) as V2SkillId[];

    expect(
      CORROSION.map(([id]) =>
        V2_SKILLS[id as V2SkillId].passive?.poisonedEnemyDefReductionPct,
      ),
    ).toEqual([6, 7, 9, 12, 14]);
    expect(
      CORROSION.map(([id]) => spCostOf(V2_SKILLS[id as V2SkillId])),
    ).toEqual([4, 4, 4, 6, 11]);
    expect(
      aggregateEquippedPassives(ids).poisonedEnemyDefReductionPct,
    ).toBeCloseTo(39.794895, 6);
  });
});
