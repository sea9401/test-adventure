// 다단(멀티히트) 스킬 로그 — resolveV2SkillCast 가 타당 피해를 hitDamages 로 분리하고,
// distributeBoostedHits 가 엔진 부스트 총합을 타당 비율로 정확히 분배하는지 검증.
// 동작 계약: 총합(=enemyDamage / boostedTotal)은 불변, 표기만 타마다 쪼개진다.

import { describe, it, expect } from "vitest";
import {
  resolveV2SkillCast,
  distributeBoostedHits,
  type V2SkillCastInput,
} from "./combatShared";

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
});
