import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rollAttackCount,
  potionHealAmount,
  extractApEffect,
  tickV2SkillCooldowns,
  pickAutoCastV2Skill,
  resolveV2SkillCast,
  tickV2BuffMap,
  applyV2BuffsToMap,
  v2BuffActive,
  v2AtkBuffMult,
  v2DefBuffMult,
} from "./combatShared";
import type { PlayerCombat } from "./engine";
import type { Potion } from "../data/potions";
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
  const strike = V2_SKILLS["v2_skill_strike"];
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
    expect(
      pickAutoCastV2Skill({
        equipped: ["v2_skill_strike", "v2_skill_flurry"],
        cooldowns: {},
        mp: strike.mpCost - 1,
      }),
    ).toBe("v2_skill_flurry");
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
    expect(result.nextMp).toBe(100 - strike.mpCost);
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
      mp: strike.mpCost * 5,
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

  it("복수 effect 한 스킬 — Tier 2 분쇄 강타 (damage + enemyDebuff vit)", () => {
    // str_crushing_blow_t2: damage statCoef 1.65 + enemyDebuff vit pct 14 turns 3
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike", "str_crushing_blow_t2"],
        equipped: ["str_crushing_blow_t2"],
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
    // floor(100 × 1.65) - 20 = 165 - 20 = 145
    expect(result.enemyDamage).toBe(145);
    expect(result.enemyDebuffsToApply).toEqual([
      { stat: "vit", pct: 14, turns: 3 },
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

  // PR-5a v2AtkBuffMult / v2DefBuffMult — 격리 해제 (일반 공격 buff 곱셈).
  it("v2AtkBuffMult — str/dex/spd/luk buff 합산, debuff 차감, 0 floor", () => {
    // empty → 1.0
    expect(v2AtkBuffMult({}, {})).toBe(1);
    // str +20% only → 1.20
    expect(v2AtkBuffMult({ str: { pct: 20, turns: 3 } }, {})).toBe(1.2);
    // str +20 + spd +10 → 1.30
    expect(
      v2AtkBuffMult(
        { str: { pct: 20, turns: 3 }, spd: { pct: 10, turns: 3 } },
        {},
      ),
    ).toBeCloseTo(1.3);
    // str debuff -20% → 0.8
    expect(v2AtkBuffMult({}, { str: { pct: 20, turns: 3 } })).toBeCloseTo(0.8);
    // vit / int buff 는 atk 무관 — 1.0 그대로
    expect(v2AtkBuffMult({ vit: { pct: 50, turns: 3 } }, {})).toBe(1);
    expect(v2AtkBuffMult({ int: { pct: 50, turns: 3 } }, {})).toBe(1);
    // 합산 debuff 가 +100% buff 보다 커도 0 floor
    expect(
      v2AtkBuffMult({}, {
        str: { pct: 50, turns: 3 },
        dex: { pct: 50, turns: 3 },
        spd: { pct: 50, turns: 3 },
      }),
    ).toBe(0);
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
