import { describe, it, expect } from "vitest";
import {
  damageBetween,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";
import {
  V2_PATTERN_SKILL_POWER_MULT_BY_TIER,
  type V2CombatPattern,
} from "./combatPattern";
import {
  V2_SKILLS,
  smartDefaultConditionForSkill,
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
        procRoll: 45,
        skills: {
          learned: [SKILL],
          equipped: [SKILL],
        },
      }),
    );
    expect(fail.castSkillId).toBeNull();

    const focused = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 45,
        skills: {
          learned: [SKILL],
          equipped: [SKILL],
          enhancements: { [SKILL]: { mode: "focus", level: 3 } },
        },
      }),
    );
    const powered = resolveV2SkillCast(
      castInput([SKILL], {
        procRoll: 45,
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

  it("패턴 피해 = 평타 바닥 + 초과분 × 차수 통과율(난격=t1)", () => {
    // 옛 경로(procRoll 미지정 = 항상 발동): 풀 위력.
    const full = resolveV2SkillCast(castInput([SKILL]));
    // 패턴 경로: 같은 입력, "평타 바닥 + 초과분 × 통과율" 로 깎임(난격=t1).
    const scaled = resolveV2SkillCast(castInput([SKILL], { combatPattern: always }));
    expect(full.castSkillId).toBe(SKILL);
    expect(scaled.castSkillId).toBe(SKILL);
    expect(full.enemyDamage).toBeGreaterThan(0);
    // 평타 바닥 = damageBetween(atk, def) × attackCount(미지정=1). 초과분만 t1 통과율로 깎인다.
    const basicFloor = damageBetween(100, 10);
    const expected = Math.round(
      basicFloor +
        Math.max(0, full.enemyDamage - basicFloor) *
          V2_PATTERN_SKILL_POWER_MULT_BY_TIER[1],
    );
    expect(scaled.enemyDamage).toBe(expected);
    // 바닥 보장 — 패턴 스킬 피해는 평타 한 번보다 작지 않다.
    expect(scaled.enemyDamage).toBeGreaterThanOrEqual(basicFloor);
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
    // 패턴 피해 = 평타바닥 + 초과분 × t3 통과율(0.28).
    expect(scaled.enemyDamage).toBe(
      Math.round(basicFloor + surplus * V2_PATTERN_SKILL_POWER_MULT_BY_TIER[3]),
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

  // 🔑 패턴 경로는 "평타(atk) 바닥" 모델 — 스킬딜 = max(atk 기반 평타 바닥, 스케일 데미지). 저-atk
  //   도적(dex/luk 빌드)에선 스케일이 바닥을 넘어 dex/luk 가 딜을 좌우(의도된 audience). 고-atk면
  //   바닥이 이김(스킬이 평타보다 약해지지 않게 — 안전). 그래서 저-atk 로 스케일 효과를 검증한다.
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

describe("resolveV2SkillCast — 원소군주 원소 공명", () => {
  it("원소 공명을 함께 장착하면 원소 폭주의 현재 속성 보조 효과가 강화된다", () => {
    const skill = "v2c_elementallord_surge";
    const base = resolveV2SkillCast(
      castInput([skill], {
        attacker: {
          ...castInput([skill]).attacker,
          characterElement: "wind",
        },
      }),
    );
    const resonant = resolveV2SkillCast(
      castInput([skill, "v2c_elementallord_resonance"], {
        attacker: {
          ...castInput([skill]).attacker,
          characterElement: "wind",
        },
      }),
    );

    expect(base.selfHasteToApply).toEqual({ pct: 55 });
    expect(resonant.selfHasteToApply).toEqual({ pct: 65 });
    expect(resonant.enemyDamage).toBe(base.enemyDamage);
  });
});
