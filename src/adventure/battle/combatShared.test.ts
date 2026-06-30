import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rollAttackCount,
  potionHealAmount,
  extractApEffect,
  tickV2SkillCooldowns,
  pickAutoCastV2Skill,
  v2SkillMpCost,
  resolveV2SkillCast,
  tickV2BuffMap,
  applyV2BuffsToMap,
  v2BuffActive,
  v2AtkBuffMult,
  v2MagicBuffMult,
  v2DefBuffMult,
  v2DamageAmount,
  tickV2Dots,
  applyV2DotsToTarget,
} from "../v2/combat/combatShared";
import type { PlayerCombat } from "../v2/combat/engine";
import type { Potion } from "../data/potions";
import {
  V2_DOT_PRESETS,
  V2_DEBUFF_PRESETS,
} from "../data/v2/statusEffects";
import { V2_SKILLS } from "../data/v2/v2Skills";

afterEach(() => vi.restoreAllMocks());

// rollAttackCount 가 읽는 필드만 채운 최소 PlayerCombat.
function combat(p: Partial<PlayerCombat>): PlayerCombat {
  return { attackCount: 1, ...p } as PlayerCombat;
}

describe("rollAttackCount (PvE/PvP 공유 — divergence 방지)", () => {
  it("추가확률 0 이면 base", () => {
    expect(rollAttackCount(combat({ attackCount: 1 }))).toBe(1);
    expect(rollAttackCount(combat({ attackCount: 2 }))).toBe(2);
  });

  it("100% 초과는 정수부만큼 확정 추가타 (random 무관)", () => {
    // 200% → +2 확정. (옛 PvP 판은 최대 +1 만 굴려 여기서 어긋났음.)
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 200 })),
    ).toBe(3);
  });

  it("나머지 %는 확률 굴림", () => {
    // 150% → +1 확정 + 50% 확률.
    vi.spyOn(Math, "random").mockReturnValue(0.4); // 40 < 50 → +1
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 150 })),
    ).toBe(3);
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.6); // 60 >= 50 → +0
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 150 })),
    ).toBe(2);
  });

  it("universalLuckBonusPct 가 추가확률에 가산", () => {
    // 60 + 60 = 120% → +1 확정 + 20% 확률.
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 99 >= 20 → +0
    expect(
      rollAttackCount(
        combat({
          attackCount: 1,
          extraAttackChancePct: 60,
          universalLuckBonusPct: 60,
        }),
      ),
    ).toBe(2);
  });
});

describe("potionHealAmount", () => {
  const potion: Potion = {
    id: "potion_heal_s",
    name: "테스트 회복약",
    effect: { kind: "heal_hp", flat: 20, pct: 0 },
  } as Potion;

  it("potionHealPct 0 이면 computeHealAmount 그대로 (flat 20)", () => {
    expect(potionHealAmount(potion, 100, 0)).toBe(20);
  });

  it("potionHealPct 가산 후 floor", () => {
    expect(potionHealAmount(potion, 100, 50)).toBe(30); // floor(20 * 1.5)
  });
});

// PR-4a v2 스킬 런타임 framework 단위테스트.
describe("tickV2SkillCooldowns (PR-4a)", () => {
  it("빈 맵은 빈 맵 반환", () => {
    expect(tickV2SkillCooldowns({})).toEqual({});
  });

  it("양수 카운터 -1 (1 보다 큰 것만 유지)", () => {
    expect(tickV2SkillCooldowns({ v2_skill_strike: 3 })).toEqual({
      v2_skill_strike: 2,
    });
  });

  it("1 인 키는 drop (다음 턴 ready 상태)", () => {
    expect(tickV2SkillCooldowns({ v2_skill_strike: 1 })).toEqual({});
  });

  it("여러 키 — 각자 독립 tick·drop", () => {
    expect(
      tickV2SkillCooldowns({
        v2_skill_strike: 4,
        v2_skill_recover: 1,
        v2_skill_fortune: 2,
      }),
    ).toEqual({
      v2_skill_strike: 3,
      v2_skill_fortune: 1,
    });
  });
});

describe("pickAutoCastV2Skill (PR-4a)", () => {
  const recover = V2_SKILLS["v2_skill_recover"];
  const flurry = V2_SKILLS["v2_skill_flurry"];

  it("equipped 빈 배열 → null", () => {
    expect(
      pickAutoCastV2Skill({
        equipped: [],
        cooldowns: {},
        mp: 999,
      }),
    ).toBeNull();
  });

  it("equipped 첫 스킬이 ready + MP 충분 → 그 스킬 반환 (슬롯 우선순위)", () => {
    expect(
      pickAutoCastV2Skill({
        equipped: ["v2_skill_strike", "v2_skill_flurry"],
        cooldowns: {},
        mp: 999,
      }),
    ).toBe("v2_skill_strike");
  });

  it("첫 슬롯 cooldown 남으면 두 번째 슬롯으로", () => {
    expect(
      pickAutoCastV2Skill({
        equipped: ["v2_skill_strike", "v2_skill_flurry"],
        cooldowns: { v2_skill_strike: 2 },
        mp: 999,
      }),
    ).toBe("v2_skill_flurry");
  });

  it("MP 부족이면 skip → 다음 슬롯", () => {
    // MP-throttle: 화염구(55) 불가 + strike(42) 딱 가능한 MP → strike (고정 절대값 모델).
    expect(
      pickAutoCastV2Skill({
        equipped: ["v2c_mage_fireball", "v2_skill_strike"],
        cooldowns: {},
        mp: v2SkillMpCost(V2_SKILLS["v2_skill_strike"]),
      }),
    ).toBe("v2_skill_strike");
  });

  it("모든 슬롯이 cd 또는 MP 부족 → null", () => {
    expect(
      pickAutoCastV2Skill({
        equipped: ["v2_skill_strike", "v2_skill_flurry"],
        cooldowns: { v2_skill_strike: 1, v2_skill_flurry: 1 },
        mp: 999,
      }),
    ).toBeNull();
  });

  // 미참조 변수 lint 회피 + spec 명확화.
  void recover;
  void flurry;
});

// PR-4b 시그니처로 cast 호출하는 헬퍼 — framework 만 검증할 때 ctx 채워준다.
function castFrameworkOnly(args: {
  skills: Parameters<typeof resolveV2SkillCast>[0]["skills"];
  cooldowns: Parameters<typeof resolveV2SkillCast>[0]["cooldowns"];
  mp: number;
}) {
  return resolveV2SkillCast({
    skills: args.skills,
    cooldowns: args.cooldowns,
    attacker: {
      mp: args.mp,
      atk: 0,
      maxHp: 0,
      selfBuffs: {},
      selfDebuffs: {},
    },
    target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
  });
}

describe("몬스터 상태이상 스킬 cast (PR-9 — 적→플레이어 적용)", () => {
  it("독니(mob_venom_bite) → 대상에 중독 DoT 적용", () => {
    const r = castFrameworkOnly({
      skills: { learned: ["mob_venom_bite"], equipped: ["mob_venom_bite"] },
      cooldowns: {},
      mp: 0,
    });
    expect(r.castSkillId).toBe("mob_venom_bite");
    expect(r.dotsToApplyToTarget).toContainEqual({
      ...V2_DOT_PRESETS.중독,
      sourceAtk: 0,
    });
    expect(r.enemyDamage).toBe(0); // 순수 상태이상 — 직접 피해 없음
  });

  it("한기(mob_chilling_touch) → 대상에 둔화(속도−) 디버프 적용", () => {
    const r = castFrameworkOnly({
      skills: {
        learned: ["mob_chilling_touch"],
        equipped: ["mob_chilling_touch"],
      },
      cooldowns: {},
      mp: 0,
    });
    expect(r.castSkillId).toBe("mob_chilling_touch");
    expect(r.enemyDebuffsToApply).toContainEqual(V2_DEBUFF_PRESETS.둔화);
  });
});

describe("resolveV2SkillCast (PR-4a — framework: cd/MP/슬롯 픽)", () => {
  it("발동 가능 — cd tick + MP 차감 + 발동 스킬 cd 세팅 (lockout = N 턴)", () => {
    const strike = V2_SKILLS["v2_skill_strike"];
    const result = castFrameworkOnly({
      skills: {
        learned: ["v2_skill_strike", "v2_skill_recover"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: { v2_skill_recover: 3 },
      mp: 100,
    });
    expect(result.castSkillId).toBe("v2_skill_strike");
    expect(result.castSkillName).toBe(strike.name);
    expect(result.nextMp).toBe(100 - v2SkillMpCost(strike));
    expect(result.nextCooldowns).toEqual({
      v2_skill_recover: 2,
      v2_skill_strike: strike.cooldown + 1,
    });
  });

  it("발동 불가 — 그래도 cd tick 만 진행 (MP/log 그대로)", () => {
    const result = castFrameworkOnly({
      skills: { learned: [], equipped: [] },
      cooldowns: { v2_skill_strike: 2 },
      mp: 50,
    });
    expect(result.castSkillId).toBeNull();
    expect(result.castSkillName).toBeNull();
    expect(result.nextMp).toBe(50);
    expect(result.nextCooldowns).toEqual({ v2_skill_strike: 1 });
  });

  it("cd=N 이면 정확히 N 턴 lockout 후 재시전 (cast T1 → T2..T(N+1) blocked → T(N+2) cast)", () => {
    const strike = V2_SKILLS["v2_skill_strike"];
    const t1 = castFrameworkOnly({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: {},
      mp: v2SkillMpCost(strike) * 5,
    });
    expect(t1.castSkillId).toBe("v2_skill_strike");
    expect(t1.nextCooldowns).toEqual({ v2_skill_strike: strike.cooldown + 1 });

    let cur = t1;
    for (let n = 0; n < strike.cooldown; n++) {
      cur = castFrameworkOnly({
        skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
        cooldowns: cur.nextCooldowns,
        mp: cur.nextMp,
      });
      expect(cur.castSkillId).toBeNull();
    }
    const ready = castFrameworkOnly({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: cur.nextCooldowns,
      mp: cur.nextMp,
    });
    expect(ready.castSkillId).toBe("v2_skill_strike");
  });
});

describe("resolveV2SkillCast 발동 확률 (procChance — 스킬 발동확률 시스템)", () => {
  const fireballMp = v2SkillMpCost(V2_SKILLS["v2c_mage_fireball"]);

  it("화염구 procChance=30 — 롤 < 30 이면 발동 (MP 차감 + 피해)", () => {
    const r = resolveV2SkillCast({
      skills: {
        learned: ["v2c_mage_fireball"],
        equipped: ["v2c_mage_fireball"],
      },
      cooldowns: {},
      procRoll: 20,
      attacker: { mp: 100, atk: 0, magicAtk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(r.castSkillId).toBe("v2c_mage_fireball");
    expect(r.nextMp).toBe(100 - fireballMp);
    expect(r.enemyDamage).toBeGreaterThan(0);
  });

  it("화염구 procChance=30 — 롤 >= 30 이면 미발동 (평타 폴백, MP·발동 없음)", () => {
    const r = resolveV2SkillCast({
      skills: {
        learned: ["v2c_mage_fireball"],
        equipped: ["v2c_mage_fireball"],
      },
      cooldowns: {},
      procRoll: 50,
      attacker: { mp: 100, atk: 0, magicAtk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(r.castSkillId).toBeNull();
    expect(r.nextMp).toBe(100); // MP 미소모
    expect(r.enemyDamage).toBe(0);
  });

  it("경계값 — 롤 === procChance 는 미발동 (>= 이면 실패)", () => {
    const r = resolveV2SkillCast({
      skills: {
        learned: ["v2c_mage_fireball"],
        equipped: ["v2c_mage_fireball"],
      },
      cooldowns: {},
      procRoll: 30,
      attacker: { mp: 100, atk: 0, magicAtk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(r.castSkillId).toBeNull();
  });

  it("procRoll 미지정 — 항상 발동 (구 호출·테스트 호환)", () => {
    const r = resolveV2SkillCast({
      skills: {
        learned: ["v2c_mage_fireball"],
        equipped: ["v2c_mage_fireball"],
      },
      cooldowns: {},
      attacker: { mp: 100, atk: 0, magicAtk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(r.castSkillId).toBe("v2c_mage_fireball");
  });

  it("procChance 미지정(=100) 스킬은 롤 무관 항상 발동 (기존 스킬 무영향)", () => {
    const r = resolveV2SkillCast({
      skills: { learned: ["v2_skill_strike"], equipped: ["v2_skill_strike"] },
      cooldowns: {},
      procRoll: 99,
      attacker: { mp: 100, atk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(r.castSkillId).toBe("v2_skill_strike");
  });

  it("procChanceBonus — 보너스가 procChance 에 합산(화염구 30+30=60 → 롤 50 발동)", () => {
    const fire = (bonus: number) =>
      resolveV2SkillCast({
        skills: {
          learned: ["v2c_mage_fireball"],
          equipped: ["v2c_mage_fireball"],
        },
        cooldowns: {},
        procRoll: 50,
        procChanceBonus: bonus,
        attacker: { mp: 100, atk: 0, magicAtk: 50, maxHp: 0, selfBuffs: {}, selfDebuffs: {} },
        target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
      });
    // 보너스 0: 30 → 50>=30 미발동. 보너스 30: 60 → 50<60 발동.
    expect(fire(0).castSkillId).toBeNull();
    expect(fire(30).castSkillId).toBe("v2c_mage_fireball");
  });
});

describe("resolveV2SkillCast 효과 적용 (PR-4b)", () => {
  it("damage effect — attacker.atk × statCoef + baseFlat − target.def, DEF 적용", () => {
    // strike: damage statCoef=1.0, baseFlat=0. atk=100, def=20 → 100×1.0 - 20 = 80
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 100,
        maxHp: 200,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 20, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.enemyDamage).toBe(80);
    expect(result.selfHeal).toBe(0);
  });

  it("heal effect — pctMaxHp 비례", () => {
    // recover: heal pctMaxHp=10. maxHp=200 → 20.
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_recover"],
        equipped: ["v2_skill_recover"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 0,
        maxHp: 200,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.selfHeal).toBe(20);
    expect(result.enemyDamage).toBe(0);
  });

  it("selfBuff effect — buff 목록 반환 (stat/pct/turns)", () => {
    // dash: selfBuff stat=spd pct=10 turns=3.
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_dash"],
        equipped: ["v2_skill_dash"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 100,
        maxHp: 200,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.selfBuffsToApply).toEqual([
      { stat: "spd", pct: 10, turns: 3 },
    ]);
    expect(result.enemyDebuffsToApply).toEqual([]);
  });

  it("v2 selfBuff(str) 활성 시 strike damage 가 atk 곱셈으로 증폭", () => {
    // 강타 (str scaling). selfBuffs.str = +20% → atk 100 × 1.20 × 1.0 − def 20 = 100.
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 100,
        maxHp: 200,
        selfBuffs: { str: { pct: 20, turns: 3 } },
        selfDebuffs: {},
      },
      target: { def: 20, selfBuffs: {}, selfDebuffs: {} },
    });
    // floor(100 × 1.20 × 1.0) - 20 = 120 - 20 = 100
    expect(result.enemyDamage).toBe(100);
  });

  it("target 의 vit selfDebuff 활성 시 target.def 감소 → damage 증폭", () => {
    // target.def 20, vit debuff 50% → effective def 10. atk 100, statCoef 1.0 → 100 - 10 = 90.
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 100,
        maxHp: 200,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: {
        def: 20,
        selfBuffs: {},
        selfDebuffs: { vit: { pct: 50, turns: 3 } },
      },
    });
    expect(result.enemyDamage).toBe(90);
  });

  it("복수 effect 한 스킬 — 파쇄 (damage + enemyDebuff vit)", () => {
    // v2c_warrior_sunder(파쇄): damage statCoef 0.7 baseFlat 90 + enemyDebuff vit(무력) pct 15 turns 3
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike", "v2c_warrior_sunder"],
        equipped: ["v2c_warrior_sunder"],
      },
      cooldowns: {},
      attacker: {
        mp: 1000,
        atk: 100,
        maxHp: 200,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 20, selfBuffs: {}, selfDebuffs: {} },
    });
    // floor(100 × 0.7 + 90) - 20 = 160 - 20 = 140
    expect(result.enemyDamage).toBe(140);
    expect(result.enemyDebuffsToApply).toEqual([
      { stat: "vit", pct: 15, turns: 3 },
    ]);
  });
});

describe("tickV2BuffMap / applyV2BuffsToMap (PR-4b)", () => {
  it("tickV2BuffMap — turns -1, 1 도달이면 drop", () => {
    expect(
      tickV2BuffMap({
        str: { pct: 20, turns: 3 },
        spd: { pct: 10, turns: 1 },
      }),
    ).toEqual({
      str: { pct: 20, turns: 2 },
      // spd drop.
    });
  });

  it("applyV2BuffsToMap — 같은 stat 키 덮어쓰기 + turns +1 시드 (다음 tick 흡수용)", () => {
    expect(
      applyV2BuffsToMap(
        { str: { pct: 5, turns: 2 } },
        [{ stat: "str", pct: 20, turns: 3 }],
      ),
    ).toEqual({ str: { pct: 20, turns: 4 } });
  });

  it("v2BuffActive — turns > 0 일 때만 pct, 아니면 0", () => {
    expect(v2BuffActive({ str: { pct: 20, turns: 3 } }, "str")).toBe(20);
    expect(v2BuffActive({ str: { pct: 20, turns: 0 } }, "str")).toBe(0);
    expect(v2BuffActive({}, "str")).toBe(0);
  });

  // PR-2 strict §4 — v2 일반공격 atk = STR 단독. dex/spd/luk 은 atk 버프에 무관.
  it("v2AtkBuffMult — str buff 만 합산(strict §4), dex/spd/luk 무관, debuff 차감, 0 floor", () => {
    // empty → 1.0
    expect(v2AtkBuffMult({}, {})).toBe(1);
    // str +20% only → 1.20
    expect(v2AtkBuffMult({ str: { pct: 20, turns: 3 } }, {})).toBe(1.2);
    // spd/dex/luk buff 는 atk 무관(strict §4) → 1.0 그대로
    expect(
      v2AtkBuffMult(
        {
          spd: { pct: 10, turns: 3 },
          dex: { pct: 50, turns: 3 },
          luk: { pct: 50, turns: 3 },
        },
        {},
      ),
    ).toBe(1);
    // str debuff -20% → 0.8
    expect(v2AtkBuffMult({}, { str: { pct: 20, turns: 3 } })).toBeCloseTo(0.8);
    // vit / int buff 는 atk 무관 — 1.0 그대로
    expect(v2AtkBuffMult({ vit: { pct: 50, turns: 3 } }, {})).toBe(1);
    expect(v2AtkBuffMult({ int: { pct: 50, turns: 3 } }, {})).toBe(1);
    // str debuff 가 +100% 보다 커도 0 floor
    expect(v2AtkBuffMult({}, { str: { pct: 150, turns: 3 } })).toBe(0);
  });

  it("v2DefBuffMult — vit 만 사용, buff/debuff 곱셈", () => {
    expect(v2DefBuffMult({}, {})).toBe(1);
    expect(v2DefBuffMult({ vit: { pct: 30, turns: 3 } }, {})).toBe(1.3);
    expect(v2DefBuffMult({}, { vit: { pct: 30, turns: 3 } })).toBeCloseTo(0.7);
    // 다른 stat 은 무관
    expect(v2DefBuffMult({ str: { pct: 50, turns: 3 } }, {})).toBe(1);
  });

  // 회귀: turns:N 의도 = 정확히 N번 tick-후 active. apply 시 +1 시드 → tick 1회 흡수 후 N.
  it("turns:3 buff 가 정확히 3 번의 tick-후 active 턴 유지 (off-by-one 회귀)", () => {
    // 시드: T1 cast 시 applyV2BuffsToMap → turns 4 박힘.
    let map = applyV2BuffsToMap({}, [{ stat: "str", pct: 20, turns: 3 }]);
    expect(map.str?.turns).toBe(4);
    // T2 entry tick → turns 3, active.
    map = tickV2BuffMap(map);
    expect(v2BuffActive(map, "str")).toBe(20);
    expect(map.str?.turns).toBe(3);
    // T3 tick → turns 2, active.
    map = tickV2BuffMap(map);
    expect(v2BuffActive(map, "str")).toBe(20);
    // T4 tick → turns 1, active.
    map = tickV2BuffMap(map);
    expect(v2BuffActive(map, "str")).toBe(20);
    // T5 tick → drop, inactive.
    map = tickV2BuffMap(map);
    expect(v2BuffActive(map, "str")).toBe(0);
  });
});

describe("v2 마법 데미지 경로 (PR-magic)", () => {
  it("v2MagicBuffMult — int 만 사용, buff/debuff 곱셈, 0 floor", () => {
    expect(v2MagicBuffMult({}, {})).toBe(1);
    // 명상 int +10% → 1.1
    expect(v2MagicBuffMult({ int: { pct: 10, turns: 3 } }, {})).toBeCloseTo(1.1);
    // 정신 안개 int -16% (자신에게 박힌 debuff) → 0.84
    expect(v2MagicBuffMult({}, { int: { pct: 16, turns: 3 } })).toBeCloseTo(0.84);
    // str/dex/spd/luk/vit 는 마법 무관 — 1.0
    expect(v2MagicBuffMult({ str: { pct: 50, turns: 3 } }, {})).toBe(1);
    expect(v2MagicBuffMult({ vit: { pct: 50, turns: 3 } }, {})).toBe(1);
    // debuff 가 +100% 초과해도 0 floor
    expect(v2MagicBuffMult({}, { int: { pct: 150, turns: 3 } })).toBe(0);
  });

  it("v2DamageAmount scaling='magic' — magicAtk 로 스케일 + int 버프 배수", () => {
    // 물리(기본): atk 100 × 1.0 - def 0 = 100. magicAtk 무시.
    expect(
      v2DamageAmount({
        attackerAtk: 100,
        attackerMagicAtk: 50,
        targetDef: 0,
        statCoef: 1.0,
        baseFlat: 0,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(100);
    // 마법: magicAtk 50 × 1.5 + 10 - def 0 = 85. atk(100) 무시.
    expect(
      v2DamageAmount({
        attackerAtk: 100,
        attackerMagicAtk: 50,
        scaling: "magic",
        targetDef: 0,
        statCoef: 1.5,
        baseFlat: 10,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(85);
    // 마법 + 명상 int +10%: floor(50 × 1.1 × 1.5) + 10 - 0 = floor(82.5)+10 = 92.
    expect(
      v2DamageAmount({
        attackerAtk: 100,
        attackerMagicAtk: 50,
        scaling: "magic",
        targetDef: 0,
        statCoef: 1.5,
        baseFlat: 10,
        attackerSelfBuffs: { int: { pct: 10, turns: 3 } },
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(92);
    // 마법인데 str 버프는 무효(물리 stat) — 50×1.5+10 = 85 그대로.
    expect(
      v2DamageAmount({
        attackerAtk: 100,
        attackerMagicAtk: 50,
        scaling: "magic",
        targetDef: 0,
        statCoef: 1.5,
        baseFlat: 10,
        attackerSelfBuffs: { str: { pct: 50, turns: 3 } },
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(85);
  });

  it("v2DamageAmount scaling='magic' 인데 magicAtk 미지정 → atk 폴백 (적·구 호출 무영향)", () => {
    // magicAtk 없으면 attackerAtk 로 폴백: 40 × 1.5 + 0 = 60.
    expect(
      v2DamageAmount({
        attackerAtk: 40,
        scaling: "magic",
        targetDef: 0,
        statCoef: 1.5,
        baseFlat: 0,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(60);
  });

  it("마법 데미지도 적 DEF 를 물리와 동일하게 적용 (마법저항 미신설)", () => {
    // magicAtk 50 × 1.5 + 10 = 85, 적 def 30 → 55.
    expect(
      v2DamageAmount({
        attackerAtk: 0,
        attackerMagicAtk: 50,
        scaling: "magic",
        targetDef: 30,
        statCoef: 1.5,
        baseFlat: 10,
        attackerSelfBuffs: {},
        attackerSelfDebuffs: {},
        targetSelfBuffs: {},
        targetSelfDebuffs: {},
      }),
    ).toBe(55);
  });

  it("v2DamageAmount elementMult (PR-5b 스킬 속성 보정) — base(atk) 에만, baseFlat 불변", () => {
    const common = {
      targetDef: 0,
      statCoef: 1.0,
      attackerSelfBuffs: {},
      attackerSelfDebuffs: {},
      targetSelfBuffs: {},
      targetSelfDebuffs: {},
    };
    // 미지정 = 보정 1 → 100.
    expect(v2DamageAmount({ attackerAtk: 100, baseFlat: 0, ...common })).toBe(
      100,
    );
    // 보정은 base(atk) 에만 곱하고 floor (구현과 동일 계산으로 부동소수점 일치).
    expect(
      v2DamageAmount({ attackerAtk: 100, baseFlat: 0, elementMult: 1.15, ...common }),
    ).toBe(Math.floor(100 * 1.15));
    expect(
      v2DamageAmount({ attackerAtk: 100, baseFlat: 0, elementMult: 0.85, ...common }),
    ).toBe(Math.floor(100 * 0.85));
    // baseFlat 은 속성 보정 안 받음 (atk 분에만 보정).
    expect(
      v2DamageAmount({ attackerAtk: 100, baseFlat: 20, elementMult: 1.15, ...common }),
    ).toBe(Math.floor(100 * 1.15) + 20);
    // 1.15 보정이 무보정(100)보다 큼 / 0.85 가 작음 — 방향 확인.
    expect(
      v2DamageAmount({ attackerAtk: 100, baseFlat: 0, elementMult: 1.15, ...common }),
    ).toBeGreaterThan(100);
    expect(
      v2DamageAmount({ attackerAtk: 100, baseFlat: 0, elementMult: 0.85, ...common }),
    ).toBeLessThan(100);
  });

  it("resolveV2SkillCast — 화염구(scaling magic)은 magicAtk 로 스케일", () => {
    // 화염구: statCoef 1.0, baseFlat 180, scaling magic. atk 는 약하지만(5) magicAtk 80.
    // 기대 직격: floor(80 × 1.0 + 180) - def 0 = 260. (procChance 30 이나 procRoll 미지정 = 항상 발동)
    const result = resolveV2SkillCast({
      skills: { learned: ["v2c_mage_fireball"], equipped: ["v2c_mage_fireball"] },
      cooldowns: {},
      attacker: {
        mp: 999,
        atk: 5,
        magicAtk: 80,
        maxHp: 1000,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.castSkillName).toBe("화염구");
    expect(result.enemyDamage).toBe(260);
  });

  it("resolveV2SkillCast — 생명 강타(scaling maxHp)는 최대 HP 로 스케일", () => {
    const result = resolveV2SkillCast({
      skills: { learned: ["v2c_immortal_lifestrike"], equipped: ["v2c_immortal_lifestrike"] },
      cooldowns: {},
      attacker: {
        mp: 999,
        atk: 5,
        maxHp: 2000,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.castSkillName).toBe("생명 강타");
    expect(result.enemyDamage).toBe(330);
  });

  it("resolveV2SkillCast — 만상검(scaling all)은 올스탯 합계로 스케일", () => {
    const result = resolveV2SkillCast({
      skills: { learned: ["v2c_transcendent_mandala"], equipped: ["v2c_transcendent_mandala"] },
      cooldowns: {},
      attacker: {
        mp: 999,
        atk: 5,
        maxHp: 1000,
        allStatTotal: 700,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.castSkillName).toBe("만상검");
    expect(result.enemyDamage).toBe(372);
  });

  it("resolveV2SkillCast — dot 효과 스킬은 dotsToApplyToTarget 에 적재(출혈)", () => {
    // mob_rending_claw(살점 뜯기): kind:"dot" 출혈만. sourceAtk 은 시전자 atk 로 채워진다.
    const result = resolveV2SkillCast({
      skills: { learned: ["mob_rending_claw"], equipped: ["mob_rending_claw"] },
      cooldowns: {},
      attacker: {
        mp: 999,
        atk: 5,
        magicAtk: 80,
        maxHp: 1000,
        selfBuffs: {},
        selfDebuffs: {},
      },
      target: { def: 0, selfBuffs: {}, selfDebuffs: {} },
    });
    expect(result.castSkillName).toBe("살점 뜯기");
    // DoT 는 별도 경로로 적용 대기 목록에 실린다(프리셋 + 시전자 atk).
    expect(result.dotsToApplyToTarget).toContainEqual({
      ...V2_DOT_PRESETS.출혈,
      sourceAtk: 5,
    });
  });
});

describe("v2 DoT (PR-8) — tick + apply", () => {
  it("tickV2Dots — 양수 turns -1, turns 1 도달 시 drop. 누적 dmg 합산", () => {
    const r = tickV2Dots([
      {
        tag: "bleed",
        label: "출혈",
        stacks: 2,
        maxStacks: 10,
        turns: 3,
        flatPerStack: 6,
        atkCoefPerStack: 0,
        pctMaxHpPerStack: 0,
        sourceAtk: 0,
      },
      {
        tag: "burn",
        label: "연소",
        stacks: 1,
        maxStacks: 1,
        turns: 1,
        flatPerStack: 8,
        atkCoefPerStack: 0,
        pctMaxHpPerStack: 0,
        sourceAtk: 0,
      },
    ]);
    expect(r.totalDmg).toBe(20);
    expect(r.nextDots).toEqual([
      {
        tag: "bleed",
        label: "출혈",
        stacks: 2,
        maxStacks: 10,
        turns: 2,
        flatPerStack: 6,
        atkCoefPerStack: 0,
        pctMaxHpPerStack: 0,
        sourceAtk: 0,
      },
    ]);
  });

  it("tickV2Dots — 빈 배열 → 빈 결과", () => {
    expect(tickV2Dots([])).toEqual({ nextDots: [], totalDmg: 0 });
  });

  it("applyV2DotsToTarget — 같은 tag stack+refresh, 새 tag append", () => {
    const current = [
      { tag: "bleed" as const, label: "출혈", stacks: 2, maxStacks: 10, turns: 2, flatPerStack: 5, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 },
      { tag: "poison" as const, label: "중독", stacks: 1, maxStacks: 10, turns: 1, flatPerStack: 0, atkCoefPerStack: 0, pctMaxHpPerStack: 0.001, sourceAtk: 10 },
    ];
    const result = applyV2DotsToTarget(current, [
      { tag: "bleed", label: "출혈", stacks: 3, maxStacks: 10, turns: 3, flatPerStack: 8, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 },
      { tag: "burn", label: "연소", stacks: 1, maxStacks: 1, turns: 2, flatPerStack: 6, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 },
    ]);
    expect(result).toEqual([
      { tag: "bleed", label: "출혈", stacks: 5, maxStacks: 10, turns: 3, flatPerStack: 8, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 },
      { tag: "poison", label: "중독", stacks: 1, maxStacks: 10, turns: 1, flatPerStack: 0, atkCoefPerStack: 0, pctMaxHpPerStack: 0.001, sourceAtk: 10 },
      { tag: "burn", label: "연소", stacks: 1, maxStacks: 1, turns: 2, flatPerStack: 6, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 },
    ]);
  });

  it("회귀: turns:N dot 가 정확히 N 번 tick 동안 활성", () => {
    // T1 apply turns:3. tick 시점 즉시 dmg 적용 + turns-1 패턴.
    // T1 tick: dmg, drop to 2. T2: dmg, drop to 1. T3: dmg, drop (turns 1 → drop).
    let dots: ReturnType<typeof tickV2Dots>["nextDots"] = applyV2DotsToTarget(
      [],
      [{ tag: "bleed", label: "출혈", stacks: 1, maxStacks: 10, turns: 3, flatPerStack: 5, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 }],
    );
    expect(dots[0].turns).toBe(3);
    let activeCount = 0;
    for (let i = 0; i < 5; i++) {
      const r = tickV2Dots(dots);
      if (r.totalDmg > 0) activeCount += 1;
      dots = r.nextDots;
    }
    expect(activeCount).toBe(3);
  });
});

describe("extractApEffect (PvE/PvP 공유 — divergence 방지)", () => {
  it("effect 없음 → 기본값", () => {
    expect(extractApEffect(undefined)).toEqual({
      atkMult: 1,
      ignoresDef: false,
      ignoresEvasion: false,
      hits: 1,
    });
  });

  it("atk_multiplier — atkMult/ignoresDef/ignoresEvasion 반영, hits=1", () => {
    expect(
      extractApEffect({
        kind: "atk_multiplier",
        atkMult: 2.5,
        ignoresDef: true,
        ignoresEvasion: true,
      } as never),
    ).toEqual({ atkMult: 2.5, ignoresDef: true, ignoresEvasion: true, hits: 1 });
  });

  it("multi_hit_self_damage — hits 반영", () => {
    expect(
      extractApEffect({
        kind: "multi_hit_self_damage",
        atkMult: 1.2,
        hits: 3,
        selfDmgPct: 10,
      } as never),
    ).toEqual({ atkMult: 1.2, ignoresDef: false, ignoresEvasion: false, hits: 3 });
  });

  it("비-mult 계열(예: heal/cleanse) → 기본값", () => {
    expect(extractApEffect({ kind: "cleanse_debuffs" } as never)).toEqual({
      atkMult: 1,
      ignoresDef: false,
      ignoresEvasion: false,
      hits: 1,
    });
  });
});
