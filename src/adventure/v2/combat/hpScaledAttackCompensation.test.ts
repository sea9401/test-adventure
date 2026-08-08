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
      atk: 0,
      str: 0,
      currentHp,
      maxHp: 1000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
  });
}

describe("HP 소모 공격 실행 계수", () => {
  it("고체력에서는 현재 HP를 피해 기준으로 쓰되 자해율은 유지한다", () => {
    const result = castBloodslash(1000);
    expect(result.selfHpCost).toBe(80);
    expect(result.enemyDamage).toBe(128);
  });

  it("저체력에서는 최대 HP 50% 하한만 피해 기준에 적용한다", () => {
    const result = castBloodslash(300);
    expect(result.selfHpCost).toBe(24);
    expect(result.enemyDamage).toBe(64);
  });
});
