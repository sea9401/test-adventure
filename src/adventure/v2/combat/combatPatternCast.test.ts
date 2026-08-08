import { describe, it, expect } from "vitest";
import {
  damageBetween,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";
import {
  V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER,
  V2_PATTERN_SKILL_POWER_MULT_BY_TIER,
  type V2CombatPattern,
} from "./combatPattern";
import {
  V2_SKILLS,
  smartDefaultConditionForSkill,
  smartDefaultPatternFromEquipped,
} from "@/adventure/data/v2/v2Skills";

// 전투 패턴이 resolveV2SkillCast 에 주입됐을 때: (1) procChance 은퇴(확정 발동), (2) 조건 게이팅.
function castInput(
  equipped: string[],
  over: Partial<V2SkillCastInput> = {},
): V2SkillCastInput {
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
    target: {
      def: 10,
      maxHp: 1000,
      currentHp: 1000,
      selfBuffs: {},
      selfDebuffs: {},
    },
    ...over,
  };
}

const SKILL = "v2c_warrior_flurry"; // procChance 40(난격)
const always: V2CombatPattern = {
  blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } }],
};

describe("resolveV2SkillCast — 전투 패턴 경로", () => {
  it("그림자 도약은 첫 턴에 단독 시전되고 다음 공격 스킬에 효과가 섞이지 않는다", () => {
    const assassinate = "v2c_shadow_assassinate";
    const shadowStep = "v2c_shadow_shadowstep";
    const equipped = [assassinate, shadowStep];
    const combatPattern = smartDefaultPatternFromEquipped(equipped);

    const first = resolveV2SkillCast(
      castInput(equipped, { combatPattern, turn: 1 }),
    );
    expect(first.castSkillId).toBe(shadowStep);
    expect(first.enemyDamage).toBe(0);
    expect(first.guaranteedEvadesToAdd).toBe(1);

    const second = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern,
        turn: 2,
        cooldowns: first.nextCooldowns,
      }),
    );
    expect(second.castSkillId).toBe(assassinate);
    expect(second.enemyDamage).toBeGreaterThan(0);
    expect(second.guaranteedEvadesToAdd).toBe(0);
  });

  it("봉마진 효과가 유지 중이면 중복 시전하지 않고 다음 공격으로 넘어간다", () => {
    const sealingField = "v2c_spellsealer_sealingfield";
    const strike = "v2c_warrior_strike";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: sealingField },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: strike },
        },
      ],
    };
    const base = castInput([sealingField, strike], { combatPattern: pattern });

    expect(resolveV2SkillCast(base).castSkillId).toBe(sealingField);
    expect(
      resolveV2SkillCast({
        ...base,
        target: {
          ...base.target,
          enemyDamageDownActive: true,
          enemySkillProcDownActive: true,
        },
      }).castSkillId,
    ).toBe(strike);
  });

  it("상대 회복 감소 상태를 전투 패턴 조건으로 전달한다", () => {
    const skillId = "v2c_warrior_strike";
    const combatPattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "enemy_debuff",
            target: "healReduction",
            active: false,
          },
          action: { kind: "skill", skillId },
        },
      ],
    };
    const base = castInput([skillId], { combatPattern });

    expect(resolveV2SkillCast(base).castSkillId).toBe(skillId);
    expect(
      resolveV2SkillCast({
        ...base,
        target: { ...base.target, enemyHealReductionActive: true },
      }).castSkillId,
    ).toBeNull();
  });

  it("self_shield 조건 — 보호막이 남아 있으면 보호막 스킬을 다시 쓰지 않는다", () => {
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "all",
            conditions: [
              { kind: "self_hp", op: "below", pct: 70 },
              { kind: "self_shield", active: false },
            ],
          },
          action: { kind: "skill", skillId: "v2c_mage_shield" },
        },
      ],
    };
    const base = castInput(["v2c_mage_shield"], {
      combatPattern: pattern,
      attacker: {
        ...castInput(["v2c_mage_shield"]).attacker,
        currentHp: 500,
      },
    });
    expect(resolveV2SkillCast(base).castSkillId).toBe("v2c_mage_shield");
    expect(
      resolveV2SkillCast({
        ...base,
        attacker: { ...base.attacker, selfShieldActive: true },
      }).castSkillId,
    ).toBeNull();
  });

  it("내 상태 효과 조건 — 지속 회복이 남아 있으면 같은 블록을 실행하지 않는다", () => {
    const skillId = "v2c_warrior_strike";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "self_buff_pct",
            target: "regen",
            active: false,
          },
          action: { kind: "skill", skillId },
        },
      ],
    };
    const base = castInput([skillId], { combatPattern: pattern });
    expect(resolveV2SkillCast(base).castSkillId).toBe(skillId);
    expect(
      resolveV2SkillCast({
        ...base,
        attacker: {
          ...base.attacker,
          selfBuffPctActive: { regen: true },
        },
      }).castSkillId,
    ).toBeNull();
  });

  it("내 속도 버프 조건 — V2 버프와 장비 발동형 임시 속도 버프를 모두 인식한다", () => {
    const skillId = "v2c_warrior_strike";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "self_buff", stat: "spd", active: true },
          action: { kind: "skill", skillId },
        },
      ],
    };
    const base = castInput([skillId], { combatPattern: pattern });
    expect(resolveV2SkillCast(base).castSkillId).toBeNull();
    expect(
      resolveV2SkillCast({
        ...base,
        attacker: {
          ...base.attacker,
          selfStatBuffActive: { spd: true },
        },
      }).castSkillId,
    ).toBe(skillId);
    expect(
      resolveV2SkillCast({
        ...base,
        attacker: {
          ...base.attacker,
          selfBuffs: { spd: { pct: 10, turns: 2 } },
        },
      }).castSkillId,
    ).toBe(skillId);
  });

  it("스킬 강화 의식은 직접 피해 최종값을 증폭한다", () => {
    const plain = resolveV2SkillCast(castInput(["v2_skill_strike"]));
    const enhanced = resolveV2SkillCast(
      castInput(["v2_skill_strike"], {
        skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
          enhancements: { v2_skill_strike: { mode: "power", level: 3 } },
        },
      }),
    );
    expect(enhanced.enemyDamage).toBe(Math.floor(plain.enemyDamage * 1.09));
  });

  it("집중 의식은 위력을 올리지 않고 발동 확률만 올린다", () => {
    const fail = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 80,
        skills: {
          learned: [SKILL],
          equipped: [SKILL],
        },
      }),
    );
    expect(fail.castSkillId).toBeNull();

    const focused = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 80,
        skills: {
          learned: [SKILL],
          equipped: [SKILL],
          enhancements: { [SKILL]: { mode: "focus", level: 3 } },
        },
      }),
    );
    const powered = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 80,
        skills: {
          learned: [SKILL],
          equipped: [SKILL],
          enhancements: { [SKILL]: { mode: "power", level: 3 } },
        },
      }),
    );

    expect(focused.castSkillId).toBe(SKILL);
    expect(powered.castSkillId).toBeNull();
    expect(focused.enemyDamage).toBe(
      resolveV2SkillCast(castInput([SKILL], { procRoll: 10 })).enemyDamage,
    );
  });

  it("패턴 피해 = 평타 초과분 통과값과 차수별 최저 배율 중 큰 값(난격=t1)", () => {
    // 옛 경로(procRoll 미지정 = 항상 발동): 풀 위력.
    const full = resolveV2SkillCast(castInput([SKILL]));
    // 패턴 경로: 같은 입력, "평타 바닥 + 초과분 × 통과율" 로 깎임(난격=t1).
    const scaled = resolveV2SkillCast(castInput([SKILL], { combatPattern: always }));
    expect(full.castSkillId).toBe(SKILL);
    expect(scaled.castSkillId).toBe(SKILL);
    expect(full.enemyDamage).toBeGreaterThan(0);
    // 평타 바닥 = damageBetween(atk, def) × attackCount(미지정=1). 초과분만 t1 통과율로 깎인다.
    const basicFloor = damageBetween(100, 10);
    const throttled = Math.round(
      basicFloor +
        Math.max(0, full.enemyDamage - basicFloor) *
          V2_PATTERN_SKILL_POWER_MULT_BY_TIER[1],
    );
    const minimum = Math.round(
      basicFloor * V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER[1],
    );
    const expected = Math.max(throttled, minimum);
    expect(scaled.enemyDamage).toBe(expected);
    expect(scaled.enemyDamage).toBeGreaterThan(basicFloor);
  });

  it("전투당 1회 회복은 패턴 빈도 보정 없이 설명대로 적용된다", () => {
    const skillId = "v2c_survivor_firstaid";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId },
        },
      ],
    };
    const result = resolveV2SkillCast(
      castInput([skillId], {
        combatPattern: pattern,
        attacker: {
          ...castInput([skillId]).attacker,
          maxHp: 200,
          currentHp: 100,
          healMult: 1,
        },
      }),
    );

    expect(result.castSkillId).toBe(skillId);
    expect(result.selfHeal).toBe(20);
  });

  it("제한 회복기는 PvP에서 회복과 부가 보호막이 50%만 적용된다", () => {
    const skillId = "v2c_rescueexpert_rescue";
    const base = castInput([skillId], {
      attacker: {
        ...castInput([skillId]).attacker,
        maxHp: 1_000,
        currentHp: 500,
        healMult: 1,
      },
    });

    const pve = resolveV2SkillCast(base);
    const pvp = resolveV2SkillCast({ ...base, combatMode: "pvp" });

    expect(pve.castSkillId).toBe(skillId);
    expect(pve.selfHeal).toBe(225);
    expect(pve.shieldToApply?.hp).toBe(80);
    expect(pvp.selfHeal).toBe(112);
    expect(pvp.shieldToApply?.hp).toBe(40);
  });

  it("PR2 — 고차(t3) 스킬은 통과율이 더 커 초과분을 더 많이 반영(t1<t3)", () => {
    const T3 = "v2c_brawler_combo"; // 벽력권 t3 — 순수 데미지(디버프/힐 없음)
    expect(V2_SKILLS[T3]?.tier).toBe(3);
    const full = resolveV2SkillCast(castInput([T3])); // non-pattern = 풀 위력
    const scaled = resolveV2SkillCast(
      castInput([T3], {
        combatPattern: {
          blocks: [
            { condition: { kind: "always" }, action: { kind: "skill", skillId: T3 } },
          ],
        },
      }),
    );
    const basicFloor = damageBetween(100, 10);
    const surplus = Math.max(0, full.enemyDamage - basicFloor);
    // 패턴 피해 = 초과분 통과값과 t3 평타 최저 배율 중 큰 값.
    const throttled = Math.round(
      basicFloor + surplus * V2_PATTERN_SKILL_POWER_MULT_BY_TIER[3],
    );
    const minimum = Math.round(
      basicFloor * V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER[3],
    );
    expect(scaled.enemyDamage).toBe(
      Math.max(throttled, minimum),
    );
    // t1 통과율(0.14)로 깎였을 값보다 크다 — 고차일수록 더 센 게 핵심.
    const asT1 = Math.round(
      basicFloor + surplus * V2_PATTERN_SKILL_POWER_MULT_BY_TIER[1],
    );
    expect(scaled.enemyDamage).toBeGreaterThan(asT1);
  });

  it("패턴 경로는 기본적으로 procChance 은퇴 — procRoll 실패해도 확정 발동(applyProcInPattern 미지정)", () => {
    // 옛 경로: procRoll 99 >= procChance 40 → 미발동.
    const old = resolveV2SkillCast(castInput([SKILL], { procRoll: 99 }));
    expect(old.castSkillId).toBeNull();
    // 패턴 경로(applyProcInPattern 미지정=false): 같은 procRoll 99 여도 조건(항상) 충족 → 확정 발동.
    const viaPattern = resolveV2SkillCast(
      castInput([SKILL], { procRoll: 99, combatPattern: always }),
    );
    expect(viaPattern.castSkillId).toBe(SKILL);
  });

  it("applyProcInPattern=true 면 패턴 경로도 procChance 굴림(부활) — 롤 실패 시 미발동", () => {
    // 난격 procChance 40. 패턴이 골라도 procRoll 99 >= 40 → 미발동(평타 폴백).
    const fail = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 99,
        combatPattern: always,
        applyProcInPattern: true,
      }),
    );
    expect(fail.castSkillId).toBeNull();
    // procRoll 10 < 40 → 통과 → 발동.
    const pass = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 10,
        combatPattern: always,
        applyProcInPattern: true,
      }),
    );
    expect(pass.castSkillId).toBe(SKILL);
  });

  it("applyProcInPattern=true 에서 1순위 proc 실패 시 다음 패턴 후보를 시도한다", () => {
    const fallback = "v2c_warrior_warcry"; // procChance 100
    const pattern: V2CombatPattern = {
      blocks: [
        { condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: fallback } },
      ],
    };
    const r = resolveV2SkillCast(
      castInput([SKILL, fallback], {
        procRoll: 99,
        combatPattern: pattern,
        applyProcInPattern: true,
      }),
    );
    expect(r.castSkillId).toBe(fallback);
  });

  it("applyProcInPattern=true 라도 procChanceBonus 합산이 게이트를 넘기면 발동(워메이지 주문연사)", () => {
    // procChance 40 + 보너스 60 = 100 클램프 → procRoll 99 여도 발동(100 미만 게이트 자체 미적용).
    const boosted = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 99,
        procChanceBonus: 60,
        combatPattern: always,
        applyProcInPattern: true,
      }),
    );
    expect(boosted.castSkillId).toBe(SKILL);
  });

  it("procChanceBonus 음수 보정은 0 아래로 클램프되어 발동을 막는다", () => {
    const suppressed = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 0,
        procChanceBonus: -100,
        combatPattern: always,
        applyProcInPattern: true,
      }),
    );

    expect(suppressed.castSkillId).toBeNull();
  });

  it("applyProcInPattern=true + procRoll 미지정이면 항상 발동(구 호출·테스트 호환)", () => {
    // procRoll 없으면 게이트 스킵 → 확정 발동(엔진은 항상 procRoll 주입하지만 방어).
    const r = resolveV2SkillCast(
      castInput([SKILL], { combatPattern: always, applyProcInPattern: true }),
    );
    expect(r.castSkillId).toBe(SKILL);
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

  it("역할 블록은 현재 장착된 같은 역할 스킬로 발동한다", () => {
    const rolePattern: V2CombatPattern = {
      blocks: [{ condition: { kind: "always" }, action: { kind: "role", role: "main_attack" } }],
    };
    const r = resolveV2SkillCast(
      castInput(["v2c_warrior_strike", SKILL], { combatPattern: rolePattern }),
    );
    expect(r.castSkillId).toBe("v2c_warrior_strike");
  });

  it("역할 블록도 장착 풀 밖의 스킬은 고르지 않는다", () => {
    const rolePattern: V2CombatPattern = {
      blocks: [{ condition: { kind: "always" }, action: { kind: "role", role: "heal" } }],
    };
    const r = resolveV2SkillCast(
      castInput(["v2c_warrior_strike"], { combatPattern: rolePattern }),
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

describe("resolveV2SkillCast — dex/luk 비례 딜(도적 직군)", () => {
  const alwaysFor = (skillId: string): V2CombatPattern => ({
    blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId } }],
  });
  const castWith = (
    skillId: string,
    attackerOver: Record<string, number>,
  ) =>
    resolveV2SkillCast(
      castInput([skillId], {
        combatPattern: alwaysFor(skillId),
        attacker: {
          mp: 999,
          atk: 50,
          maxHp: 1000,
          currentHp: 1000,
          maxMp: 100,
          selfBuffs: {},
          selfDebuffs: {},
          ...attackerOver,
        } as V2SkillCastInput["attacker"],
      }),
    );

  // 특화 스킬은 공격력 기반선 + DEX/LUK 계수를 합산한다. 저-atk 에서도 특화 스탯 성장 효과를 유지한다.
  it("궁사 기습 = DEX 비례 (저-atk 도적 빌드에서 DEX 가 딜 좌우)", () => {
    const loDex = castWith("v2c_ranger_ambush", { atk: 10, dex: 100 }).enemyDamage;
    const hiDex = castWith("v2c_ranger_ambush", { atk: 10, dex: 400 }).enemyDamage;
    expect(hiDex).toBeGreaterThan(loDex); // DEX 올리면 딜↑(dex 스케일 작동).
  });

  it("자객 처단 = LUK 비례 (저-atk, 풀피 base)", () => {
    const loLuk = castWith("v2c_assassin_ambush", { atk: 10, luk: 100 }).enemyDamage;
    const hiLuk = castWith("v2c_assassin_ambush", { atk: 10, luk: 400 }).enemyDamage;
    expect(hiLuk).toBeGreaterThan(loLuk); // LUK 올리면 딜↑(luk 스케일 작동).
  });

  it("DEX 특화 스킬도 공격력이 오르면 함께 강해진다", () => {
    const lowAtk = castWith("v2c_ranger_ambush", {
      atk: 100,
      dex: 300,
    }).enemyDamage;
    const highAtk = castWith("v2c_ranger_ambush", {
      atk: 500,
      dex: 300,
    }).enemyDamage;
    expect(highAtk).toBeGreaterThan(lowAtk);
  });

  it("SPI 특화 스킬의 평타 기준선은 SPI가 아니라 마법공격력을 사용한다", () => {
    const skillId = "v2c_savior_judgment";
    const magicAtk = 800;
    const targetDef = 200;
    const result = resolveV2SkillCast(
      castInput([skillId], {
        combatPattern: alwaysFor(skillId),
        attacker: {
          ...castInput([skillId]).attacker,
          atk: 300,
          magicAtk,
          spi: 250,
          classTier: 4,
        },
        target: {
          ...castInput([skillId]).target,
          def: 100,
          magicDef: targetDef,
        },
      }),
    );
    const magicBasic = damageBetween(magicAtk, targetDef);
    expect(result.enemyDamage).toBeGreaterThanOrEqual(
      Math.round(
        magicBasic * V2_PATTERN_SKILL_MIN_BASIC_MULT_BY_TIER[3],
      ),
    );
  });
});

describe("resolveV2SkillCast — 기습(ambushDamage · 암살자 오프너)", () => {
  // 저-atk·고-luk 암살자 빌드. 패턴 없이(viaPattern=false) 쏘면 raw(throttle/floor 미적용)라 메커니즘만 본다.
  const atkr = {
    mp: 999, atk: 10, luk: 300, maxHp: 1000, currentHp: 1000, maxMp: 100,
    selfBuffs: {}, selfDebuffs: {},
  } as V2SkillCastInput["attacker"];
  const tgt = (hpPct: number) => ({
    def: 10, maxHp: 1000, currentHp: Math.round((1000 * hpPct) / 100),
    selfBuffs: {}, selfDebuffs: {},
  });
  const rawCast = (skillId: string, hpPct: number) =>
    resolveV2SkillCast(
      castInput([skillId], { procRoll: 0, attacker: atkr, target: tgt(hpPct) }),
    ).enemyDamage;

  it("풀피(HP≥90%)엔 ×3.0 보너스, 깎인 적(HP<90%)엔 낮은 기본딜(처형의 역)", () => {
    const full = rawCast("v2c_phantom_ambush", 100);
    const low = rawCast("v2c_phantom_ambush", 50);
    expect(full).toBeGreaterThan(low * 2); // 풀피 보너스(×3.0)가 비보너스의 2배 이상.
  });

  it("기본딜(비보너스)이 그림자 암살 기본딜보다 낮다 — 계속 쓰면 손해", () => {
    // 둘 다 보너스 미발동 중간 HP(50%: 기습 풀피 아님·암살 처형창 아님)에서 base 비교.
    const phantomBase = rawCast("v2c_phantom_ambush", 50);
    const shadowBase = rawCast("v2c_shadow_assassinate", 50);
    expect(phantomBase).toBeLessThan(shadowBase);
  });

  it("오프너라 패턴 빈도 throttle 면제 — 패턴 경로여도 raw 그대로(평타바닥+14% 압축 안 됨)", () => {
    const ambushPattern: V2CombatPattern = {
      blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_phantom_ambush" } }],
    };
    const raw = rawCast("v2c_phantom_ambush", 100);
    const viaPattern = resolveV2SkillCast(
      castInput(["v2c_phantom_ambush"], { combatPattern: ambushPattern, attacker: atkr, target: tgt(100) }),
    ).enemyDamage;
    expect(viaPattern).toBe(raw); // 면제 없으면 floor+초과×0.14 로 깎여 raw 보다 작았을 것.
  });

  it("기본 발동 조건 = 첫 턴 오프너(turn≤1) — 그 외 턴엔 평타로 폴백", () => {
    const cond = smartDefaultConditionForSkill(V2_SKILLS.v2c_phantom_ambush);
    expect(cond).toEqual({ kind: "turn", op: "atMost", value: 1 });
  });
});

describe("resolveV2SkillCast — 일반 PvE 처단 임계 보정", () => {
  it("executeHpThresholdFloorPct가 있으면 15% 처단도 일반 몬스터 35% 구간에서 보너스를 받는다", () => {
    const base = resolveV2SkillCast(castInput(["v2c_assassin_ambush"], {
      attacker: {
        ...castInput(["v2c_assassin_ambush"]).attacker,
        atk: 10,
        luk: 300,
      },
      target: {
        def: 10,
        maxHp: 1000,
        currentHp: 340,
        selfBuffs: {},
        selfDebuffs: {},
      },
    }));
    const normalMonster = resolveV2SkillCast(castInput(["v2c_assassin_ambush"], {
      attacker: {
        ...castInput(["v2c_assassin_ambush"]).attacker,
        atk: 10,
        luk: 300,
      },
      target: {
        def: 10,
        maxHp: 1000,
        currentHp: 340,
        executeHpThresholdFloorPct: 35,
        selfBuffs: {},
        selfDebuffs: {},
      },
    }));

    expect(normalMonster.enemyDamage).toBeGreaterThan(base.enemyDamage);
  });
});

describe("resolveV2SkillCast — 문장술사 장착 시너지", () => {
  it("대문장 해방은 총명 계열 패시브가 함께 장착되면 추가 효과를 얻는다", () => {
    const skill = "v2c_runecaster_grandsigil";
    const base = resolveV2SkillCast(castInput([skill]));
    const withSigils = resolveV2SkillCast(
      castInput([
        skill,
        "v2c_mage_acumen",
        "v2c_caster_acumen",
        "v2c_magus_acumen3",
      ]),
    );

    expect(withSigils.castSkillId).toBe(skill);
    expect(withSigils.hitDamages.length).toBe(base.hitDamages.length + 1);
    expect(withSigils.enemyDamage).toBeGreaterThan(base.enemyDamage);
    expect(withSigils.manaRestored).toBe(5);
    expect(withSigils.enemyVulnToApply).toEqual({ pct: 12, turns: 2 });
  });
});

describe("resolveV2SkillCast — 각인술사 복수 장착 시너지", () => {
  it("각인 증폭을 함께 장착하면 각인 해방의 문장 재료 효과가 추가로 열린다", () => {
    const skill = "v2c_inscriber_release";
    const materials = [
      skill,
      "v2c_mage_acumen",
      "v2c_caster_acumen",
      "v2c_magus_acumen3",
      "v2c_runecaster_circuit",
    ];
    const base = resolveV2SkillCast(castInput(materials));
    const amplified = resolveV2SkillCast(
      castInput([...materials, "v2c_inscriber_amplification"]),
    );

    expect(base.castSkillId).toBe(skill);
    expect(amplified.castSkillId).toBe(skill);
    expect(amplified.hitDamages.length).toBe(base.hitDamages.length + 2);
    expect(amplified.enemyDamage).toBeGreaterThan(base.enemyDamage);
    expect(base.manaRestored).toBe(7);
    expect(amplified.manaRestored).toBe(11);
    expect(base.shieldToApply).toMatchObject({ mp: 10, turns: 3 });
    expect(amplified.shieldToApply).toMatchObject({ mp: 16, turns: 3 });
    expect(amplified.enemyVulnToApply).toEqual({ pct: 14, turns: 2 });
  });
});

describe("resolveV2SkillCast — 주술사 고차 디버프", () => {
  it("재앙의 낙인은 쇠약과 금제를 함께 적용한다", () => {
    const r = resolveV2SkillCast(castInput(["v2c_calamitycaller_brand"]));

    expect(r.castSkillId).toBe("v2c_calamitycaller_brand");
    expect(r.enemyDamage).toBeGreaterThan(0);
    expect(r.enemyDamageDownToApply).toEqual({ pct: 14, turns: 3 });
    expect(r.enemySkillProcDownToApply).toEqual({ pct: 18, turns: 3 });
  });

  it("종말 선고는 침식과 마법취약 스택 보상 피해를 적용한다", () => {
    const target = {
      ...castInput(["v2c_doomprophet_sentence"]).target,
      magicVulnStacks: 5,
    };
    const noStacks = resolveV2SkillCast(castInput(["v2c_doomprophet_sentence"]));
    const stacked = resolveV2SkillCast(
      castInput(["v2c_doomprophet_sentence"], { target }),
    );

    expect(stacked.castSkillId).toBe("v2c_doomprophet_sentence");
    expect(stacked.enemyDotVulnToApply).toEqual({ pct: 24, turns: 3 });
    expect(stacked.enemyDamage).toBeGreaterThan(noStacks.enemyDamage);
  });
});

describe("resolveV2SkillCast — 원소군주·태초술사 주문식", () => {
  const elemental = [
    "v2c_firemage_inferno",
    "v2c_frostmage_glacier",
    "v2c_lightningmage_thunderbolt",
    "v2c_windmage_tempest",
    "v2c_earthmage_tectonic",
  ] as const;

  it("다섯 대표 주문 보유만으로 오원소 주문식의 이름과 기본 성능이 바뀐다", () => {
    const skill = "v2c_elementallord_surge";
    const base = resolveV2SkillCast(castInput([skill]));
    const owned = resolveV2SkillCast(
      castInput([skill], {
        skills: {
          learned: [skill, ...elemental],
          equipped: [skill],
        } as V2SkillCastInput["skills"],
      }),
    );

    expect(base.castSkillName).toBe("오원소 폭주");
    expect(owned.castSkillName).toBe("오원소 대폭주");
    expect(owned.enemyDamage).toBeGreaterThan(base.enemyDamage);
    expect(owned.enemyVulnToApply).toEqual({ pct: 12, turns: 3 });
  });

  it("화염과 바람을 함께 장착하면 화염폭풍 효과가 발현되고 공명이 추가 출력을 더한다", () => {
    const skill = "v2c_elementallord_surge";
    const materials = [skill, "v2c_firemage_inferno", "v2c_windmage_tempest"];
    const storm = resolveV2SkillCast(castInput(materials));
    const resonant = resolveV2SkillCast(
      castInput([...materials, "v2c_elementallord_resonance"]),
    );

    expect(storm.castSkillName).toBe("화염폭풍");
    expect(storm.selfHasteToApply).toEqual({ pct: 35 });
    expect(storm.dotsToApplyToTarget.some((dot) => dot.tag === "burn")).toBe(true);
    expect(resonant.castSkillName).toBe("화염폭풍");
    expect(resonant.enemyDamage).toBeGreaterThan(storm.enemyDamage);
    expect(resonant.manaRestored).toBeGreaterThan(0);
  });

  it("태초술사는 같은 조합을 상위 주문명과 더 강한 효과로 승격한다", () => {
    const lord = resolveV2SkillCast(
      castInput(["v2c_elementallord_surge", "v2c_firemage_inferno", "v2c_windmage_tempest"]),
    );
    const primordial = resolveV2SkillCast(
      castInput(["v2c_primordialmage_return", "v2c_firemage_inferno", "v2c_windmage_tempest"]),
    );

    expect(primordial.castSkillName).toBe("태초의 화염폭풍");
    expect(primordial.enemyDamage).toBeGreaterThan(lord.enemyDamage);
    expect(primordial.selfHasteToApply).toEqual({ pct: 45 });
  });
});
