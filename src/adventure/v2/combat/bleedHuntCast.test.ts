import { describe, expect, it } from "vitest";
import type {
  V2SkillCategory,
  V2SkillEffect,
  V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import {
  applyBleedChangeToDots,
  isPureDirectPhysicalSkill,
  makeBleedDot,
  removeMissedV2SkillTargetEffects,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";

function cast(
  skillId: V2SkillId,
  {
    passives = [],
    bleedStacks = 0,
    bleedTurns = 0,
    bleedHuntRoll = 99,
    directDamagePiercePctAdd,
  }: {
    passives?: V2SkillId[];
    bleedStacks?: number;
    bleedTurns?: number;
    bleedHuntRoll?: number;
    directDamagePiercePctAdd?: number;
  } = {},
) {
  const equipped = [skillId, ...passives];
  const input: V2SkillCastInput = {
    skills: { learned: equipped, equipped },
    cooldowns: {},
    procRoll: 0,
    bleedHuntRoll,
    directDamagePiercePctAdd,
    attacker: {
      mp: 999,
      atk: 100,
      str: 100,
      dex: 100,
      maxHp: 1_000,
      currentHp: 500,
      maxMp: 999,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: {
      def: 20,
      maxHp: 2_000,
      currentHp: 2_000,
      bleedStacks,
      bleedTurns,
      selfBuffs: {},
      selfDebuffs: {},
    },
  };
  return resolveV2SkillCast(input);
}

describe("출혈 사냥 시전 스냅샷", () => {
  it.each([0, 4])("%i중첩에서는 5중첩 액티브가 꺼진다", (bleedStacks) => {
    const result = cast("v2c_tracker_pounce", { bleedStacks, bleedTurns: 3 });
    expect(result.skillAccuracyBonusPct).toBe(0);
    expect(result.enemyDelayToApply).toBeUndefined();
  });

  it.each([5, 9, 10])("%i중첩에서는 추격 도약의 적중과 지연이 켜진다", (bleedStacks) => {
    const result = cast("v2c_tracker_pounce", { bleedStacks, bleedTurns: 3 });
    expect(result.skillAccuracyBonusPct).toBe(15);
    expect(result.enemyDelayToApply).toEqual({ pct: 20 });
  });

  it("상처 덧내기는 시전 전 5중첩부터 1중첩과 4회 갱신 의도를 낸다", () => {
    expect(cast("v2c_beastwarrior_reopen", { bleedStacks: 4, bleedTurns: 3 }).bleedChangeToApply)
      .toBeUndefined();
    expect(cast("v2c_beastwarrior_reopen", { bleedStacks: 5, bleedTurns: 2 }).bleedChangeToApply)
      .toEqual({ stacksToAdd: 1, setTurns: 4, reason: "refresh" });
    expect(cast("v2c_beastwarrior_reopen", { bleedStacks: 10, bleedTurns: 1 }).bleedChangeToApply)
      .toEqual({ stacksToAdd: 1, setTurns: 4, reason: "refresh" });
  });

  it("혈흔 가르기는 시전 전 10중첩에서만 스택 없이 지속을 갱신한다", () => {
    expect(cast("v2c_bloodtracker_trailslash", { bleedStacks: 9, bleedTurns: 2 }).bleedChangeToApply)
      .toBeUndefined();
    expect(cast("v2c_bloodtracker_trailslash", { bleedStacks: 10, bleedTurns: 2 }).bleedChangeToApply)
      .toEqual({ stacksToAdd: 0, setTurns: 4, reason: "refresh" });
  });

  it("장착 패시브와 액티브 관통·가속을 합산한다", () => {
    const result = cast("v2c_primalpredator_primalfeast", {
      passives: ["v2c_tracker_instinct", "v2c_bloodtracker_reading"],
      bleedStacks: 10,
      bleedTurns: 3,
    });
    const explicitTwenty = cast("v2c_primalpredator_primalfeast", {
      bleedStacks: 0,
      directDamagePiercePctAdd: 20,
    });
    expect(result.enemyDamage).toBe(explicitTwenty.enemyDamage);
    expect(result.selfHasteToApply).toEqual({ pct: 21 });
    expect(result.healFromActualDamagePct).toBe(18);
  });

  it("혈흔 감식의 관통은 처형형 직접 물리 스킬에도 적용된다", () => {
    const base = cast("v2c_veteran_cleave", {
      bleedStacks: 10,
      bleedTurns: 3,
    });
    const withReading = cast("v2c_veteran_cleave", {
      passives: ["v2c_bloodtracker_reading"],
      bleedStacks: 10,
      bleedTurns: 3,
    });
    expect(withReading.enemyDamage).toBeGreaterThan(base.enemyDamage);
  });

  it("포식은 실제 피해 회복 의도 14%를 반환한다", () => {
    expect(cast("v2c_predator_devour", { bleedStacks: 10, bleedTurns: 3 }).healFromActualDamagePct)
      .toBe(14);
  });

  it("야수의 정점은 순수 직접 물리 피해를 한 번만 12% 증폭한다", () => {
    const base = cast("v2c_tracker_pounce", { bleedStacks: 10, bleedTurns: 3 });
    const apex = cast("v2c_tracker_pounce", {
      passives: ["v2c_primalpredator_apex"],
      bleedStacks: 10,
      bleedTurns: 3,
    });
    expect(apex.enemyDamage).toBe(Math.floor(base.enemyDamage * 1.12));
    expect(apex.hitDamages).toEqual([apex.enemyDamage]);
  });

  it("9→10을 만드는 시전은 시전 전 스냅샷으로 야수의 정점을 판정한다", () => {
    const withoutApex = cast("v2c_beastwarrior_reopen", {
      bleedStacks: 9,
      bleedTurns: 3,
    });
    const withApex = cast("v2c_beastwarrior_reopen", {
      passives: ["v2c_primalpredator_apex"],
      bleedStacks: 9,
      bleedTurns: 3,
    });
    expect(withApex.enemyDamage).toBe(withoutApex.enemyDamage);
    expect(withApex.bleedChangeToApply?.stacksToAdd).toBe(1);
  });

  it("4→5를 만드는 기존 출혈 스킬은 새 단계의 패시브를 미리 받지 않는다", () => {
    const result = cast("v2c_beastkin_rend", {
      passives: ["v2c_beastwarrior_keenscent"],
      bleedStacks: 4,
      bleedTurns: 3,
    });
    expect(result.dotsToApplyToTarget[0]?.stacks).toBeGreaterThan(0);
    expect(result.skillAccuracyBonusPct).toBe(0);
  });

  it.each([
    [2, 29.999, 3],
    [3, 29.999, 4],
    [4, 29.999, undefined],
    [2, 30, undefined],
  ] as const)("출혈 %i회, 롤 %s의 연장 결과를 제한한다", (bleedTurns, bleedHuntRoll, nextTurns) => {
    const result = cast("v2c_tracker_pounce", {
      passives: ["v2c_primalpredator_apex"],
      bleedStacks: 10,
      bleedTurns,
      bleedHuntRoll,
    });
    if (nextTurns == null) {
      expect(result.bleedChangeToApply).toBeUndefined();
    } else {
      expect(result.bleedChangeToApply).toEqual({
        stacksToAdd: 0,
        extendTurns: 1,
        maxTurns: 4,
        reason: "extend",
      });
    }
  });

  it("빗나가면 대상 의도와 실제 피해 회복만 제거하고 가속은 유지한다", () => {
    const hit = cast("v2c_primalpredator_primalfeast", {
      passives: ["v2c_tracker_instinct", "v2c_primalpredator_apex"],
      bleedStacks: 10,
      bleedTurns: 2,
      bleedHuntRoll: 0,
    });
    const miss = removeMissedV2SkillTargetEffects(hit);
    expect(miss.enemyDelayToApply).toBeUndefined();
    expect(miss.bleedChangeToApply).toBeUndefined();
    expect(miss.healFromActualDamagePct).toBe(0);
    expect(miss.selfHasteToApply).toEqual({ pct: 21 });
  });
});

describe("순수 직접 물리 스킬 분류", () => {
  const damage = (scaling?: Extract<V2SkillEffect, { kind: "damage" }>['scaling']): V2SkillEffect => ({
    kind: "damage",
    statCoef: 1,
    baseFlat: 0,
    ...(scaling ? { scaling } : {}),
  });
  const classify = (category: V2SkillCategory, effects: V2SkillEffect[]) =>
    isPureDirectPhysicalSkill(category, effects);

  it("물리 단일·다단과 물리 특화 계수를 허용한다", () => {
    expect(classify("attack", [damage()])).toBe(true);
    expect(classify("attack", [damage(), damage("physical")])).toBe(true);
    for (const scaling of ["def", "vit", "dex", "luk", "all", "maxHp"] as const) {
      expect(classify("attack", [damage(scaling)])).toBe(true);
    }
  });

  it("마법·정신·혼합·비공격·DoT·고정 피해만 있는 효과를 거부한다", () => {
    expect(classify("attack", [damage("magic")])).toBe(false);
    expect(classify("attack", [damage("spi")])).toBe(false);
    expect(classify("attack", [damage(), damage("magic")])).toBe(false);
    expect(classify("heal", [damage()])).toBe(false);
    expect(
      classify("attack", [
        {
          kind: "dot",
          tag: "bleed",
          label: "출혈",
          stacks: 1,
          maxStacks: 10,
          turns: 3,
          flatPerStack: 0,
          atkCoefPerStack: 0.45,
          pctMaxHpPerStack: 0,
        },
      ]),
    ).toBe(false);
    expect(classify("attack", [{ kind: "healToDamage", healStatCoef: 1, damageRatio: 1 }])).toBe(false);
  });
});

describe("출혈 변경 적용", () => {
  it("원본 출혈의 피해 출처를 보존하고 스택·지속만 바꾼다", () => {
    const original = makeBleedDot({
      stacks: 9,
      turns: 2,
      flatPerStack: 7,
      sourceAtk: 321,
    });
    const [changed] = applyBleedChangeToDots([original], {
      stacksToAdd: 3,
      setTurns: 4,
      reason: "refresh",
    });
    expect(changed).toEqual({ ...original, stacks: 10, turns: 4 });
  });
});
