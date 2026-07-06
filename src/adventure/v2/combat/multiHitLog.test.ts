// 다단(멀티히트) 스킬 로그 — resolveV2SkillCast 가 타당 피해를 hitDamages 로 분리하고,
// distributeBoostedHits 가 엔진 부스트 총합을 타당 비율로 정확히 분배하는지 검증.
// 동작 계약: 총합(=enemyDamage / boostedTotal)은 불변, 표기만 타마다 쪼개진다.

import { describe, it, expect } from "vitest";
import {
  applyComboFinisherToHits,
  resolveV2SkillCast,
  distributeBoostedHits,
  v2DamageAmount,
  type V2SkillCastInput,
} from "./combatShared";
import { scaleCombatNumber } from "@/adventure/data/v2/combatNumberScale";

function castInput(equipped: string[]): V2SkillCastInput {
  return {
    skills: { learned: equipped, equipped } as V2SkillCastInput["skills"],
    cooldowns: {},
    // procRoll 생략 = 항상 발동(결정적).
    attacker: { mp: 999, atk: 100, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 10, selfBuffs: {}, selfDebuffs: {} },
  };
}

describe("distributeBoostedHits — 부스트 총합 정수 분배", () => {
  it("빈 배열 / 단일타 처리", () => {
    expect(distributeBoostedHits([], 50)).toEqual([]);
    expect(distributeBoostedHits([10], 50)).toEqual([50]);
  });

  it("부스트 없는 경우(총합 = raw 합) raw 를 그대로 복원", () => {
    expect(distributeBoostedHits([45, 47, 44], 136)).toEqual([45, 47, 44]);
  });

  it("비율 분배 + 합은 정확히 boostedTotal (반올림 누수 없음)", () => {
    const d = distributeBoostedHits([10, 10, 10], 100);
    expect(d).toHaveLength(3);
    expect(d.reduce((a, b) => a + b, 0)).toBe(100);
    // 마지막 칸이 나머지를 흡수 → 33,33,34.
    expect(d).toEqual([33, 33, 34]);
  });

  it("불균등 raw 비율 보존", () => {
    expect(distributeBoostedHits([30, 10], 80)).toEqual([60, 20]);
  });

  it("raw 전부 0(퇴화) — 균등 분배해도 합 정확", () => {
    const d = distributeBoostedHits([0, 0, 0], 10);
    expect(d.reduce((a, b) => a + b, 0)).toBe(10);
    expect(d).toHaveLength(3);
  });
});

describe("applyComboFinisherToHits — 절초 4타째 보너스", () => {
  it("보너스가 없으면 피해와 카운터를 그대로 유지", () => {
    expect(applyComboFinisherToHits([10, 20], 2, 0)).toEqual({
      hitDamages: [10, 20],
      nextComboHitCount: 2,
    });
  });

  it("4타째 피해만 증폭하고 누적 카운터를 진행", () => {
    expect(applyComboFinisherToHits([10, 10, 10, 10, 10], 0, 30)).toEqual({
      hitDamages: [10, 10, 10, 13, 10],
      nextComboHitCount: 5,
    });
  });

  it("이전 타수에서 이어 받아 다음 타격을 마무리 강타로 처리", () => {
    expect(applyComboFinisherToHits([10, 10], 3, 50)).toEqual({
      hitDamages: [15, 10],
      nextComboHitCount: 5,
    });
  });
});

describe("resolveV2SkillCast — hitDamages 분리", () => {
  it("다단 스킬(난격 3타) → hitDamages 3개, 합 = enemyDamage", () => {
    const r = resolveV2SkillCast(castInput(["v2c_warrior_flurry"]));
    expect(r.castSkillId).toBe("v2c_warrior_flurry");
    expect(r.hitDamages).toHaveLength(3);
    expect(r.hitDamages.every((h) => h > 0)).toBe(true);
    expect(r.hitDamages.reduce((a, b) => a + b, 0)).toBe(r.enemyDamage);
  });

  it("연환 난타(5타) → hitDamages 5개", () => {
    const r = resolveV2SkillCast(castInput(["v2c_martial_combo"]));
    expect(r.castSkillId).toBe("v2c_martial_combo");
    expect(r.hitDamages).toHaveLength(5);
    expect(r.hitDamages.reduce((a, b) => a + b, 0)).toBe(r.enemyDamage);
  });

  it("단일타 스킬(강타) → hitDamages 1개", () => {
    const r = resolveV2SkillCast(castInput(["v2c_warrior_strike"]));
    expect(r.castSkillId).toBe("v2c_warrior_strike");
    expect(r.hitDamages).toHaveLength(1);
    expect(r.hitDamages[0]).toBe(r.enemyDamage);
  });

  it("관통사(신궁) — pierceDamagePct 20: 본타 + 0방어 피해의 20% 방어무시 추가타(같은 타)", () => {
    const TARGET_DEF = 80;
    const r = resolveV2SkillCast({
      skills: {
        learned: ["v2c_chief_strike"],
        equipped: ["v2c_chief_strike"],
      } as V2SkillCastInput["skills"],
      cooldowns: {},
      // dex scaling — attacker.dex 가 공격 스탯(없으면 atk 폴백). statScaled 라 버프 무시(빈 맵).
      attacker: { mp: 999, atk: 100, dex: 100, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
      target: { def: TARGET_DEF, selfBuffs: {}, selfDebuffs: {} },
    });
    // 관통사 = { statCoef 0.35, baseFlat 250, scaling dex, pierceDamagePct 20 }.
    // damageWith(dex) → dex/baseFlat 을 전투 숫자 단위로 보정한 뒤 v2DamageAmount 로 계산.
    const common = {
      attackerAtk: scaleCombatNumber(100),
      scaling: "physical" as const,
      statCoef: 0.35,
      baseFlat: scaleCombatNumber(250),
      attackerSelfBuffs: {},
      attackerSelfDebuffs: {},
      targetSelfBuffs: {},
      targetSelfDebuffs: {},
      elementMult: 1,
    };
    const base = v2DamageAmount({ ...common, targetDef: TARGET_DEF });
    const noDef = v2DamageAmount({ ...common, targetDef: 0 });
    expect(r.hitDamages).toHaveLength(1); // 단일타 — 관통분은 같은 타에 합산(별도 로그 아님)
    expect(r.enemyDamage).toBe(base + Math.round(noDef * 0.2));
    // 관통분(noDef·방어 무시)은 적 방어와 무관 — 본타(base)가 방어로 깎여도 그대로 박힌다.
    expect(r.enemyDamage).toBeGreaterThan(base);
  });
});
