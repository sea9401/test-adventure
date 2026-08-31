import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT,
  equipmentCritMultToMagicSkillCritBonus,
} from "./skillCritical";

describe("equipmentCritMultToMagicSkillCritBonus", () => {
  it("장비 치명타 배율을 가파른 점근 곡선으로 변환한다", () => {
    expect(equipmentCritMultToMagicSkillCritBonus(0)).toBe(0);
    expect(equipmentCritMultToMagicSkillCritBonus(0.5)).toBeCloseTo(
      0.165899,
      5,
    );
    expect(equipmentCritMultToMagicSkillCritBonus(1)).toBeCloseTo(
      0.295102,
      5,
    );
    expect(equipmentCritMultToMagicSkillCritBonus(2)).toBeCloseTo(
      0.47409,
      5,
    );
    expect(equipmentCritMultToMagicSkillCritBonus(5)).toBeCloseTo(
      0.688436,
      5,
    );
  });

  it("음수·비정상 입력은 0으로 처리하고 최대 +0.75x를 넘지 않는다", () => {
    expect(equipmentCritMultToMagicSkillCritBonus(-1)).toBe(0);
    expect(equipmentCritMultToMagicSkillCritBonus(Number.NaN)).toBe(0);
    expect(equipmentCritMultToMagicSkillCritBonus(Number.POSITIVE_INFINITY)).toBe(
      0,
    );
    expect(equipmentCritMultToMagicSkillCritBonus(100)).toBeLessThanOrEqual(
      EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT,
    );
    expect(EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT).toBe(0.75);
  });
});
