import { describe, expect, it } from "vitest";
import type { V2CombatCondition, V2CombatPattern } from "./combatPattern";
import {
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";

const SKILL = "v2c_warrior_flurry";
const CONDITION = {
  kind: "enemy_debuff",
  target: "vit",
  active: true,
} satisfies V2CombatCondition;
const PATTERN: V2CombatPattern = {
  blocks: [
    {
      condition: CONDITION,
      action: { kind: "skill", skillId: SKILL },
    },
  ],
};

function cast(
  selfDebuffs: V2SkillCastInput["target"]["selfDebuffs"],
) {
  return resolveV2SkillCast({
    skills: {
      learned: [SKILL],
      equipped: [SKILL],
    } as V2SkillCastInput["skills"],
    cooldowns: {},
    combatPattern: PATTERN,
    attacker: {
      mp: 999,
      atk: 100,
      maxHp: 1_000,
      currentHp: 1_000,
      maxMp: 100,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 10,
      maxHp: 1_000,
      currentHp: 1_000,
      selfBuffs: {},
      selfDebuffs,
    },
  });
}

describe("전투 패턴 상대 능력치 감소 조건", () => {
  it("무력의 활력 감소가 활성일 때만 조건 스킬을 선택한다", () => {
    expect(cast({ vit: { pct: 15, turns: 3 } }).castSkillId).toBe(SKILL);
    expect(cast({ vit: { pct: 15, turns: 0 } }).castSkillId).toBeNull();
    expect(cast({}).castSkillId).toBeNull();
  });
});
