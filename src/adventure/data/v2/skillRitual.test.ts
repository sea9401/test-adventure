import { describe, expect, it } from "vitest";
import {
  isSkillRitualEligible,
  isSkillRitualFocusEligible,
  isSkillRitualPowerEligible,
  normalizeSkillEnhancements,
  skillRitualBonusPct,
  skillRitualRefund,
} from "./skillRitual";
import { V2_SKILLS } from "./v2Skills";

describe("skillRitual", () => {
  it("비용 단계의 누적 위력 보너스를 반환한다", () => {
    expect(skillRitualBonusPct(0)).toBe(0);
    expect(skillRitualBonusPct(1)).toBe(2);
    expect(skillRitualBonusPct(3)).toBe(9);
    expect(skillRitualBonusPct(5)).toBe(20);
  });

  it("위력 또는 발동률 보정 가능한 스킬을 강화 대상으로 본다", () => {
    expect(isSkillRitualEligible(V2_SKILLS.v2_skill_strike)).toBe(true);
    expect(isSkillRitualEligible(V2_SKILLS.v2_skill_recover)).toBe(true);
    expect(isSkillRitualPowerEligible(V2_SKILLS.v2_skill_strike)).toBe(true);
    expect(isSkillRitualFocusEligible(V2_SKILLS.v2_skill_strike)).toBe(false);
    expect(isSkillRitualFocusEligible(V2_SKILLS.v2c_warrior_flurry)).toBe(true);
    expect(isSkillRitualEligible(V2_SKILLS.v2_skill_dash)).toBe(false);
  });

  it("배우지 않은 스킬과 범위 밖 단계는 정규화한다", () => {
    expect(
      normalizeSkillEnhancements(
        {
          v2_skill_strike: 7,
          v2_skill_dash: 2,
          bogus: 3,
        },
        ["v2_skill_strike"],
      ),
    ).toEqual({ v2_skill_strike: { mode: "power", level: 5 } });
  });

  it("새 저장 형태의 의식 방향을 보존한다", () => {
    expect(
      normalizeSkillEnhancements(
        {
          v2c_warrior_flurry: { mode: "focus", level: 2 },
          v2_skill_strike: { mode: "power", level: 1 },
        },
        ["v2c_warrior_flurry", "v2_skill_strike"],
      ),
    ).toEqual({
      v2c_warrior_flurry: { mode: "focus", level: 2 },
      v2_skill_strike: { mode: "power", level: 1 },
    });
  });

  it("초기화 환급은 누적 비용의 50%다", () => {
    expect(skillRitualRefund(3)).toEqual({
      gold: 6_000_000,
      proficiency: 1_450,
    });
  });
});
