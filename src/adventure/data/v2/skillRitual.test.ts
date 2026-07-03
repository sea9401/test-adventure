import { describe, expect, it } from "vitest";
import {
  isSkillRitualEligible,
  normalizeSkillEnhancements,
  skillRitualBonusPct,
} from "./skillRitual";
import { V2_SKILLS } from "./v2Skills";

describe("skillRitual", () => {
  it("비용 단계의 누적 위력 보너스를 반환한다", () => {
    expect(skillRitualBonusPct(0)).toBe(0);
    expect(skillRitualBonusPct(1)).toBe(2);
    expect(skillRitualBonusPct(3)).toBe(9);
    expect(skillRitualBonusPct(5)).toBe(20);
  });

  it("직접 위력 스킬만 강화 대상으로 본다", () => {
    expect(isSkillRitualEligible(V2_SKILLS.v2_skill_strike)).toBe(true);
    expect(isSkillRitualEligible(V2_SKILLS.v2_skill_recover)).toBe(true);
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
    ).toEqual({ v2_skill_strike: 5 });
  });
});
