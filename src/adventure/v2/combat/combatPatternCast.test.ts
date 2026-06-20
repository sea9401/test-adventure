import { describe, it, expect } from "vitest";
import {
  damageBetween,
  resolveV2SkillCast,
  type V2SkillCastInput,
} from "./combatShared";
import {
  V2_PATTERN_SKILL_POWER_MULT,
  type V2CombatPattern,
} from "./combatPattern";

// 전투 패턴이 resolveV2SkillCast 에 주입됐을 때: (1) procChance 은퇴(확정 발동), (2) 조건 게이팅.
function castInput(equipped: string[], over: Partial<V2SkillCastInput> = {}): V2SkillCastInput {
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
    target: { def: 10, maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    ...over,
  };
}

const SKILL = "v2c_warrior_flurry"; // procChance 40(난격)
const always: V2CombatPattern = {
  blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } }],
};

describe("resolveV2SkillCast — 전투 패턴 경로", () => {
  it("위력 중립 — 패턴 피해 = 평타 바닥 + 초과분 × mult (평타 기준 보너스)", () => {
    // 옛 경로(procRoll 미지정 = 항상 발동): 풀 위력.
    const full = resolveV2SkillCast(castInput([SKILL]));
    // 패턴 경로: 같은 입력, "평타 바닥 + 초과분×mult" 로 깎임.
    const scaled = resolveV2SkillCast(castInput([SKILL], { combatPattern: always }));
    expect(full.castSkillId).toBe(SKILL);
    expect(scaled.castSkillId).toBe(SKILL);
    expect(full.enemyDamage).toBeGreaterThan(0);
    // 평타 바닥 = damageBetween(atk, def) × attackCount(미지정=1). 초과분만 mult 로 깎인다.
    const basicFloor = damageBetween(100, 10);
    const expected = Math.round(
      basicFloor + Math.max(0, full.enemyDamage - basicFloor) * V2_PATTERN_SKILL_POWER_MULT,
    );
    expect(scaled.enemyDamage).toBe(expected);
    // 바닥 보장 — 패턴 스킬 피해는 평타 한 번보다 작지 않다.
    expect(scaled.enemyDamage).toBeGreaterThanOrEqual(basicFloor);
  });

  it("패턴 경로는 procChance 은퇴 — procRoll 실패해도 확정 발동", () => {
    // 옛 경로: procRoll 99 >= procChance 40 → 미발동.
    const old = resolveV2SkillCast(castInput([SKILL], { procRoll: 99 }));
    expect(old.castSkillId).toBeNull();
    // 패턴 경로: 같은 procRoll 99 여도 조건(항상) 충족 → 확정 발동.
    const viaPattern = resolveV2SkillCast(
      castInput([SKILL], { procRoll: 99, combatPattern: always }),
    );
    expect(viaPattern.castSkillId).toBe(SKILL);
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
  it("유격수 기습 = DEX 비례 (저-atk 도적 빌드에서 DEX 가 딜 좌우)", () => {
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
