import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveV2SkillCast } from "./combatShared";

afterEach(() => vi.restoreAllMocks());

function castBloodslash(currentHp: number) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  return resolveV2SkillCast({
    skills: {
      learned: ["v2c_berserker_bloodslash"],
      equipped: ["v2c_berserker_bloodslash"],
    },
    cooldowns: {},
    attacker: {
      mp: 999,
      atk: 100,
      str: 100,
      currentHp,
      maxHp: 1000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
  });
}

describe("사혈격 HP 소모와 잃은 체력 계수", () => {
  it("고체력에서는 현재 HP 10%를 먼저 투영해 잃은 체력 계수를 계산한다", () => {
    const result = castBloodslash(1000);
    expect(result.selfHpCost).toBe(100);
    expect(result.enemyDamage).toBe(208);
  });

  it("저체력에서는 같은 10% 비용을 내면서 잃은 체력 계수로 더 강해진다", () => {
    const result = castBloodslash(300);
    expect(result.selfHpCost).toBe(30);
    expect(result.enemyDamage).toBe(258);
  });
});
