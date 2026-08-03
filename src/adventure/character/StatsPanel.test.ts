import { describe, expect, it } from "vitest";
import { activeSkillCritStats } from "./StatsPanel";

describe("activeSkillCritStats", () => {
  it("액티브 스킬은 캐릭터 치명타 확률을 75% 상한으로 공유한다", () => {
    expect(activeSkillCritStats({ critChancePct: 62 })).toEqual({
      chancePct: 62,
      multiplier: 1.5,
    });
    expect(activeSkillCritStats({ critChancePct: 100 })).toEqual({
      chancePct: 75,
      multiplier: 1.5,
    });
  });

  it("관련 패시브가 있으면 초과 치명타 확률을 스킬 배율에도 반영한다", () => {
    expect(
      activeSkillCritStats({ critChancePct: 100, skillCritOverflow: true }),
    ).toEqual({ chancePct: 75, multiplier: 2 });
  });
});
