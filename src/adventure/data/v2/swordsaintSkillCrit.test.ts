import { describe, expect, it } from "vitest";

import {
  aggregateEquippedPassives,
  spCostOf,
  V2_SKILLS,
} from "./v2Skills";

describe("검성 일검필살", () => {
  it("평타 치명타 배율은 건드리지 않고 스킬 치명타 피해만 강화한다", () => {
    const skill = V2_SKILLS.v2c_swordsaint_transcendence;
    const passive = aggregateEquippedPassives([skill.id]);

    expect(passive.critDmgPct).toBe(0);
    expect(passive.skillCritDmgPct).toBe(35);
    expect(spCostOf(skill)).toBe(13);
  });
});
