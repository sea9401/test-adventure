// 다단(멀티히트) 스킬 로그 — resolveV2SkillCast 가 타당 피해를 hitDamages 로 분리하고,
// distributeBoostedHits 가 엔진 부스트 총합을 타당 비율로 정확히 분배하는지 검증.
// 동작 계약: 총합(=enemyDamage / boostedTotal)은 불변, 표기만 타마다 쪼개진다.

import { describe, it, expect } from "vitest";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import {
  V2_SKILL_HYBRID_ATTACK_BASE_COEF_BY_TIER,
  v2SpecializedSkillStatCoef,
} from "./combatPattern";
import {
  applyComboFinisherToHits,
  resolveV2SkillCast,
  distributeBoostedHits,
  v2DamageAmount,
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
      // dex scaling — 공격력 기반선과 DEX 특화 계수를 함께 사용한다.
      attacker: { mp: 999, atk: 100, dex: 100, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} },
      target: { def: TARGET_DEF, selfBuffs: {}, selfDebuffs: {} },
    });
    // 관통사 수치는 전역 차수 리밸런싱까지 적용된 최종 카탈로그 값을 기준으로 한다.
    // damageWith(dex) → 공격력×t3 혼합 기반선 + DEX×statCoef, 고정 기본 피해 없음.
    const effect = V2_SKILLS.v2c_chief_strike.effects[0];
    expect(effect.kind).toBe("damage");
    if (effect.kind !== "damage") throw new Error("관통사 피해 효과 누락");
    const common = {
      attackerAtk: 100,
      scaling: "physical" as const,
      statCoef:
        effect.attackCoef ?? V2_SKILL_HYBRID_ATTACK_BASE_COEF_BY_TIER[3],
      baseFlat: Math.floor(
        100 * v2SpecializedSkillStatCoef(effect.statCoef, effect.scaling),
      ),
      attackerSelfBuffs: {},
      attackerSelfDebuffs: {},
      targetSelfBuffs: {},
      targetSelfDebuffs: {},
      elementMult: 1,
    };
    const base = v2DamageAmount({ ...common, targetDef: TARGET_DEF });
    const noDef = v2DamageAmount({ ...common, targetDef: 0 });
    expect(r.hitDamages).toHaveLength(1); // 단일타 — 관통분은 같은 타에 합산(별도 로그 아님)
    expect(r.enemyDamage).toBe(
      base + Math.round(noDef * ((effect.pierceDamagePct ?? 0) / 100)),
    );
    // 관통분(noDef·방어 무시)은 적 방어와 무관 — 본타(base)가 방어로 깎여도 그대로 박힌다.
    expect(r.enemyDamage).toBeGreaterThan(base);
  });

  it("모든 플레이어 다단기는 적 방어력 한 번분만 타수에 나눠 부담한다", () => {
    const directKinds = new Set([
      "damage",
      "hpCostDamage",
      "missingHpDamage",
      "executeDamage",
      "ambushDamage",
      "stackPayoffDamage",
    ]);
    const multiHitSkills = Object.values(V2_SKILLS).filter(
      (skill) =>
        !skill.monsterOnly &&
        skill.effects.filter((effect) => directKinds.has(effect.kind)).length > 1,
    );
    const TARGET_DEF = 600;
    const cast = (skillId: string, targetDef: number) =>
      resolveV2SkillCast({
        skills: {
          learned: [skillId],
          equipped: [skillId],
        } as V2SkillCastInput["skills"],
        cooldowns: {},
        attacker: {
          mp: 9999,
          atk: 1000,
          magicAtk: 1000,
          def: 1000,
          vit: 1000,
          dex: 1000,
          luk: 1000,
          spi: 1000,
          allStatTotal: 6000,
          maxHp: 10000,
          currentHp: 10000,
          selfBuffs: {},
          selfDebuffs: {},
        },
        // 50% HP에서는 기습·처형 조건이 모두 꺼져 방어력 차이만 비교할 수 있다.
        target: {
          def: targetDef,
          magicDef: targetDef,
          currentHp: 5000,
          maxHp: 10000,
          selfBuffs: {},
          selfDebuffs: {},
        },
      });

    expect(multiHitSkills).toHaveLength(24);
    for (const skill of multiHitSkills) {
      const noDef = cast(skill.id, 0);
      const guarded = cast(skill.id, TARGET_DEF);
      const directHitCount = skill.effects.filter((effect) =>
        directKinds.has(effect.kind),
      ).length;

      expect(guarded.hitDamages, skill.id).toHaveLength(directHitCount);
      expect(
        noDef.enemyDamage - guarded.enemyDamage,
        `${skill.id}: 다단 방어력 중복 차감`,
      ).toBeLessThanOrEqual(TARGET_DEF + directHitCount);
    }
  });

  it("궁술·암살 5·6차의 발동률 반영 피해가 같은 조건의 만상검보다 낮지 않다", () => {
    const skillIds = [
      "v2c_marksman_shot",
      "v2c_nightshade_eclipse",
      "v2c_transcendent_mandala",
      "v2c_heavenlybow_orbit",
      "v2c_blackmoon_flurry",
      "v2c_bloodlord_brand",
      "v2c_blooddemon_reign",
    ] as const;
    const expectedDamage = Object.fromEntries(
      skillIds.map((skillId) => {
        const skill = V2_SKILLS[skillId];
        const result = resolveV2SkillCast({
          skills: { learned: [skillId], equipped: [skillId] },
          cooldowns: {},
          attacker: {
            mp: 9999,
            atk: 1000,
            magicAtk: 1000,
            dex: 1000,
            luk: 1000,
            allStatTotal: 6000,
            maxHp: 10000,
            currentHp: 10000,
            selfBuffs: {},
            selfDebuffs: {},
          },
          target: {
            def: 1000,
            magicDef: 1000,
            currentHp: 5000,
            maxHp: 10000,
            selfBuffs: {},
            selfDebuffs: {},
          },
        });
        return [
          skillId,
          result.enemyDamage * ((skill.procChance ?? 100) / 100),
        ];
      }),
    );
    const mandala = expectedDamage.v2c_transcendent_mandala;

    expect(expectedDamage.v2c_marksman_shot).toBeGreaterThanOrEqual(mandala);
    expect(expectedDamage.v2c_nightshade_eclipse).toBeGreaterThanOrEqual(mandala);
    expect(expectedDamage.v2c_heavenlybow_orbit).toBeGreaterThanOrEqual(
      mandala * 2,
    );
    expect(expectedDamage.v2c_blackmoon_flurry).toBeGreaterThanOrEqual(
      mandala * 2,
    );
    // 유틸을 가진 궁술·암살기가 같은 차수의 고위험 순수 공격기를 넘어 최상위 누커가 되지는 않는다.
    expect(expectedDamage.v2c_marksman_shot).toBeLessThanOrEqual(
      expectedDamage.v2c_bloodlord_brand,
    );
    expect(expectedDamage.v2c_nightshade_eclipse).toBeLessThanOrEqual(
      expectedDamage.v2c_bloodlord_brand,
    );
    expect(expectedDamage.v2c_heavenlybow_orbit).toBeLessThanOrEqual(
      expectedDamage.v2c_blooddemon_reign,
    );
    expect(expectedDamage.v2c_blackmoon_flurry).toBeLessThanOrEqual(
      expectedDamage.v2c_blooddemon_reign,
    );
  });

  it("월식은 대표 능력치·방어력 구간에서 하위 기습과 암살보다 강하다", () => {
    const castAtHp = (
      skillId:
        | "v2c_phantom_ambush"
        | "v2c_shadow_assassinate"
        | "v2c_nightshade_eclipse",
      stats: { atk: number; luk: number; def: number },
      hpPct: number,
      combatMode: "pve" | "pvp" = "pve",
    ) =>
      resolveV2SkillCast({
        skills: { learned: [skillId], equipped: [skillId] },
        cooldowns: {},
        combatMode,
        attacker: {
          mp: 9999,
          atk: stats.atk,
          luk: stats.luk,
          maxHp: 10000,
          currentHp: 10000,
          selfBuffs: {},
          selfDebuffs: {},
        },
        target: {
          def: stats.def,
          currentHp: hpPct * 100,
          maxHp: 10000,
          selfBuffs: {},
          selfDebuffs: {},
          // 일반 PvE는 15% 암살도 35%부터 처형 보정을 받는다.
          executeHpThresholdFloorPct: 35,
        },
      }).enemyDamage;

    expect(V2_SKILLS.v2c_nightshade_eclipse.effects[0]).toMatchObject({
      kind: "ambushDamage",
      bonusMult: 5,
      pvpBonusMult: 4,
    });
    expect(V2_SKILLS.v2c_nightshade_eclipse.effects[1]).toMatchObject({
      kind: "executeDamage",
      bonusMult: 3,
    });

    const representativeBuilds = [
      { atk: 1000, luk: 700, def: 300 },
      { atk: 1000, luk: 1000, def: 1000 },
      { atk: 1500, luk: 1000, def: 500 },
      { atk: 1000, luk: 1500, def: 500 },
    ];
    for (const stats of representativeBuilds) {
      expect(
        castAtHp("v2c_nightshade_eclipse", stats, 100),
        `월식 오프너가 기습보다 약함: ${JSON.stringify(stats)}`,
      ).toBeGreaterThan(castAtHp("v2c_phantom_ambush", stats, 100));
      expect(
        castAtHp("v2c_nightshade_eclipse", stats, 35),
        `월식 처형이 암살보다 약함: ${JSON.stringify(stats)}`,
      ).toBeGreaterThan(castAtHp("v2c_shadow_assassinate", stats, 35));
    }

    const pveOpener = castAtHp(
      "v2c_nightshade_eclipse",
      representativeBuilds[0],
      100,
      "pve",
    );
    const pvpOpener = castAtHp(
      "v2c_nightshade_eclipse",
      representativeBuilds[0],
      100,
      "pvp",
    );
    expect(pveOpener).toBe(3794);
    expect(pvpOpener).toBe(3167);
  });
});
