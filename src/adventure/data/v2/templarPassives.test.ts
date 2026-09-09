import { describe, expect, it } from "vitest";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf, describeV2Skill } from "./v2Skills";

const passives = ["v2c_radiantknight_grace", "v2c_dawnpaladin_covenant"] as const;
describe("성기사 범용 패시브", () => {
  it("범용 스탯은 직업과 무관하게 적용한다", () => {
    const p = aggregateEquippedPassives(passives);
    expect(p.statPct).toMatchObject({ str: 20, vit: 20, spi: 40 });
    expect(p.healPowerPct).toBe(25);
    expect(p.damageTakenReductionPct).toBe(5);
  });
  it.each(["templar", "crusader", "radiantknight", "dawnpaladin"])("%s는 계열 보너스를 받는다", (jobId) => {
    const p = aggregateEquippedPassives(passives, jobId);
    expect(p.healPowerPct).toBe(35);
    expect(p.damageTakenReductionPct).toBe(8);
    expect(aggregateEquippedPassives([], jobId).healPowerPct).toBe(0);
  });
  it.each(["bloodtemplar", "transcendent", "warrior"])("%s는 계열 보너스가 없다", (jobId) => {
    expect(aggregateEquippedPassives(passives, jobId)).toEqual(aggregateEquippedPassives(passives));
  });
  it("SP는 7·6이고 계열 조건을 설명한다", () => {
    expect(passives.map(id => spCostOf(V2_SKILLS[id]))).toEqual([7, 6]);
    for (const id of passives) expect(describeV2Skill(V2_SKILLS[id]).join(" ")).toContain("성기사 계열");
  });
});
