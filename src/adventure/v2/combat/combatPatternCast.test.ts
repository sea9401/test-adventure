import { describe, it, expect } from "vitest";
import {
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";
import type { V2CombatPattern } from "./combatPattern";

// 전투 패턴이 resolveV2SkillCast 에 주입됐을 때: (1) procChance 은퇴(확정 발동), (2) 조건 게이팅.
function castInput(equipped: string[], over: Partial<V2SkillCastInput> = {}): V2SkillCastInput {
  return {
    skills: { learned: equipped, equipped } as V2SkillCastInput["skills"],
    cooldowns: {},
    attacker: {
      mp: 999,
      atk: 100,
      maxHp: 1000,
      currentHp: 1000,
      maxMp: 100,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: { def: 10, maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    ...over,
  };
}

const SKILL = "v2c_warrior_flurry"; // procChance 40(난격)
const always: V2CombatPattern = {
  blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } }],
};

describe("resolveV2SkillCast — 전투 패턴 경로", () => {
  it("패턴 경로는 procChance 은퇴 — procRoll 실패해도 확정 발동", () => {
    // 옛 경로: procRoll 99 >= procChance 40 → 미발동.
    const old = resolveV2SkillCast(castInput([SKILL], { procRoll: 99 }));
    expect(old.castSkillId).toBeNull();
    // 패턴 경로: 같은 procRoll 99 여도 조건(항상) 충족 → 확정 발동.
    const viaPattern = resolveV2SkillCast(
      castInput([SKILL], { procRoll: 99, combatPattern: always }),
    );
    expect(viaPattern.castSkillId).toBe(SKILL);
  });

  it("조건 게이팅 — self_hp below 30 은 저피일 때만 발동", () => {
    const pattern: V2CombatPattern = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: SKILL } },
      ],
    };
    // 풀피(100%) → 조건 불충족 → 미발동.
    expect(
      resolveV2SkillCast(castInput([SKILL], { combatPattern: pattern })).castSkillId,
    ).toBeNull();
    // 저피(10%) → 조건 충족 → 발동.
    const base = castInput([SKILL]);
    const low = resolveV2SkillCast(
      castInput([SKILL], {
        combatPattern: pattern,
        attacker: { ...base.attacker, currentHp: 100 },
      }),
    );
    expect(low.castSkillId).toBe(SKILL);
  });

  it("미장착 스킬을 참조한 블록은 발동 안 함(equipped 풀 유지)", () => {
    const refsUnequipped: V2CombatPattern = {
      blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } }],
    };
    // SKILL 미장착(equipped=다른 스킬) → 패턴이 SKILL 가리켜도 발동 안 함.
    const r = resolveV2SkillCast(
      castInput(["v2c_warrior_strike"], { combatPattern: refsUnequipped }),
    );
    expect(r.castSkillId).toBeNull();
  });

  it("빈 패턴(조건 안 맞음) → 미발동(평타 폴백)", () => {
    const none: V2CombatPattern = {
      blocks: [
        { condition: { kind: "enemy_hp", op: "below", pct: 10 }, action: { kind: "skill", skillId: SKILL } },
      ],
    };
    // 적 풀피 → 조건 불충족 → null.
    expect(resolveV2SkillCast(castInput([SKILL], { combatPattern: none })).castSkillId).toBeNull();
  });
});
