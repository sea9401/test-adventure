import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rollAttackCount,
  potionHealAmount,
  extractApEffect,
  tickV2SkillCooldowns,
  pickAutoCastV2Skill,
  resolveV2SkillCast,
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

describe("resolveV2SkillCast (PR-4a — framework, 효과 미적용)", () => {
  it("발동 가능 — cd tick + MP 차감 + 발동 스킬 cd 세팅 (lockout = N 턴)", () => {
    const strike = V2_SKILLS["v2_skill_strike"];
    const result = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike", "v2_skill_recover"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: { v2_skill_recover: 3 }, // 다른 스킬 cd
      mp: 100,
    });
    expect(result.castSkillId).toBe("v2_skill_strike");
    expect(result.castSkillName).toBe(strike.name);
    expect(result.nextMp).toBe(100 - strike.mpCost);
    expect(result.nextCooldowns).toEqual({
      v2_skill_recover: 2, // tick 됐고
      v2_skill_strike: strike.cooldown + 1, // 다음 tick 까지 lockout 시드 (N+1 → tick 후 N).
    });
  });

  it("발동 불가 — 그래도 cd tick 만 진행 (MP/log 그대로)", () => {
    const result = resolveV2SkillCast({
      skills: { learned: [], equipped: [] }, // 장착 없음
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
    // T1: cast → cd[strike] = strike.cooldown + 1
    const t1 = resolveV2SkillCast({
      skills: {
        learned: ["v2_skill_strike"],
        equipped: ["v2_skill_strike"],
      },
      cooldowns: {},
      mp: strike.mpCost * 5,
    });
    expect(t1.castSkillId).toBe("v2_skill_strike");
    expect(t1.nextCooldowns).toEqual({ v2_skill_strike: strike.cooldown + 1 });

    // T2..T(N+1) — 매 turn entry 마다 tick. 마지막 tick (T(N+1)) 에서도 cd>0 이라 cast skip.
    let cur = t1;
    for (let n = 0; n < strike.cooldown; n++) {
      cur = resolveV2SkillCast({
        skills: {
          learned: ["v2_skill_strike"],
          equipped: ["v2_skill_strike"],
        },
        cooldowns: cur.nextCooldowns,
        mp: cur.nextMp,
      });
      expect(cur.castSkillId).toBeNull();
    }
    // T(N+2) — tick 으로 cd 가 drop → 재시전 가능.
    const ready = resolveV2SkillCast({
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
