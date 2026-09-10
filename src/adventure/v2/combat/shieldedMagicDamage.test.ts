import { describe, expect, it } from "vitest";
import { directMagicSkillDamageBonus } from "./shieldedMagicDamage";

describe("직접 마법 보호막 보너스", () => {
  it.each([
    [0, 10], [1, 50], [10000, 50], [-1, 10],
  ])("보호막 %s에서 기존 10%%와 조건부 20%% 두 개를 합산한다", (shield, expected) => {
    expect(directMagicSkillDamageBonus({ damage: 100, shield, basePct: 10, passivePct: 20, skillPct: 20 })).toBe(expected);
  });
  it("소진 후 보너스를 제거하고 다시 생성되면 복구한다", () => {
    const damage = (shield: number) => directMagicSkillDamageBonus({ damage: 105, shield, passivePct: 20 });
    expect([damage(100), damage(0), damage(1)]).toEqual([21, 0, 21]);
  });
  it("퍼센트를 합산한 후 한 번만 내림하고 잘못된 보너스는 무시한다", () => {
    expect(directMagicSkillDamageBonus({ damage: 103, shield: 1, basePct: 3, passivePct: 3, skillPct: 3 })).toBe(9);
    expect(directMagicSkillDamageBonus({ damage: 100, shield: 1, basePct: -10, passivePct: NaN, skillPct: Infinity })).toBe(0);
  });
});
