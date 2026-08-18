import { describe, expect, it } from "vitest";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  removeMissedV2SkillTargetEffects,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";

function cast(skillId: V2SkillId) {
  return resolveV2SkillCast({
    skills: { learned: [skillId], equipped: [skillId] },
    cooldowns: {},
    procRoll: 0,
    attacker: {
      mp: 999,
      atk: 100,
      magicAtk: 100,
      int: 100,
      maxHp: 1_000,
      currentHp: 1_000,
      maxMp: 1_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 0,
      magicDef: 0,
      maxHp: 10_000,
      currentHp: 10_000,
      selfBuffs: {},
      selfDebuffs: {},
    },
  } satisfies V2SkillCastInput);
}

describe("한기 생성 시전 요청", () => {
  it("빙하진과 절대영도는 현재 직업 검사 없이 시전당 한기를 요청한다", () => {
    expect(cast("v2c_frostmage_glacier").frostChillGain).toBe(2);
    expect(cast("v2c_cryomancer_absolutezero").frostChillGain).toBe(3);
  });

  it("일반 스킬과 미발동 결과는 한기를 요청하지 않는다", () => {
    expect(cast("v2_skill_strike").frostChillGain).toBe(0);
    expect(
      resolveV2SkillCast({
        ...({
          skills: { learned: [], equipped: [] },
          cooldowns: {},
          attacker: {
            mp: 0,
            atk: 100,
            maxHp: 1_000,
            currentHp: 1_000,
            maxMp: 0,
            selfBuffs: {},
            selfDebuffs: {},
          },
          target: {
            def: 0,
            maxHp: 1_000,
            currentHp: 1_000,
            selfBuffs: {},
            selfDebuffs: {},
          },
        } satisfies V2SkillCastInput),
      }).frostChillGain,
    ).toBe(0);
  });

  it("빗나가거나 확정 회피되면 한기 요청도 제거한다", () => {
    const landed = cast("v2c_frostmage_glacier");
    expect(removeMissedV2SkillTargetEffects(landed).frostChillGain).toBe(0);
  });
});
