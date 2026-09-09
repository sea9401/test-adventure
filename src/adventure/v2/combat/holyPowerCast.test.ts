import { describe, expect, it } from "vitest";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { parseCombatPattern } from "./combatPattern";

const judgment = "v2c_dawnpaladin_judgment";
function input(power: number, patterned = false): V2SkillCastInput {
  return {
    skills: {
      learned: [judgment], equipped: [judgment],
      ...(patterned ? { pattern: { blocks: [{ condition: { kind: "always" as const }, action: { kind: "skill" as const, skillId: judgment } }] } } : {}),
    },
    cooldowns: {}, procRoll: 0,
    ...(patterned ? { combatPattern: { blocks: [{ condition: { kind: "always" as const }, action: { kind: "skill" as const, skillId: judgment } }] } } : {}),
    attacker: { atk: 100, str: 30, spi: 20, mp: 1000, maxHp: 1000, selfBuffs: {}, selfDebuffs: {}, holyPower: { power, sanctuaryTurns: 0 } },
    target: { def: 40, selfBuffs: {}, selfDebuffs: {} },
  };
}

describe("성력 실제 시전", () => {
  it.each([false, true])("패턴 %s: 성력 0/40/100의 계수와 방어 적용 순서", (patterned) => {
    for (const [power, damage] of [[0, 260], [40, 440], [100, 710]]) {
      const result = resolveV2SkillCast(input(power, patterned));
      expect(result.castSkillId).toBe(judgment);
      expect(result.enemyDamage).toBe(damage);
      expect(result.selfHeal).toBe(0);
    }
  });
  it("성력 패턴을 저장하고 현재 자원으로 판정한다", () => {
    const pattern = { blocks: [{ condition: { kind: "self_resource" as const, resource: "holyPower" as const, op: "atLeast" as const, value: 40 }, action: { kind: "skill" as const, skillId: judgment } }] };
    expect(parseCombatPattern(pattern)).toMatchObject(pattern);
    const args = input(39);
    args.combatPattern = pattern;
    expect(resolveV2SkillCast(args).castSkillId).toBeNull();
    args.attacker.holyPower = { power: 40, sanctuaryTurns: 0 };
    expect(resolveV2SkillCast(args).castSkillId).toBe(judgment);
  });
});
