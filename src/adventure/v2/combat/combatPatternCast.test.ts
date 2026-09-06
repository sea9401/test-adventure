import { describe, it, expect } from "vitest";
import {
  damageBetween,
  removeMissedV2SkillTargetEffects,
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
  effectiveCombatPatternFromEquipped,
  smartDefaultConditionForSkill,
  smartDefaultPatternFromEquipped,
} from "@/adventure/data/v2/v2Skills";
import { resolveElementalResonanceLoadout } from "@/adventure/data/v2/elementalResonance";

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
  it("스킬 판정은 사용하지 않는 장착 SP 비용을 계산하지 않는다", () => {
    const skill = V2_SKILLS[SKILL];
    const original = Object.getOwnPropertyDescriptor(skill, "spCost");
    Object.defineProperty(skill, "spCost", {
      configurable: true,
      get() { throw new Error("combat must not calculate loadout SP"); },
    });
    try {
      const result = resolveV2SkillCast(castInput([SKILL], { combatPattern: always }));
      expect(result.enemyDamage).toBeGreaterThan(0);
    } finally {
      if (original) Object.defineProperty(skill, "spCost", original);
      else delete skill.spCost;
    }
  });

  const berserkerCast = (
    skillId: string,
    currentHp: number,
    over: Partial<V2SkillCastInput> = {},
  ) => {
    const base = castInput([skillId]);
    return resolveV2SkillCast({
      ...base,
      ...over,
      attacker: {
        ...base.attacker,
        atk: 100,
        str: 100,
        currentHp,
        ...(over.attacker ?? {}),
      },
      target: {
        ...base.target,
        def: 0,
        ...(over.target ?? {}),
      },
    });
  };

  it("잃은 HP 경계와 명중 후 자해 예상 체력으로 단발 피해를 계산한다", () => {
    expect(berserkerCast("v2c_overlord_ruin", 1_000).enemyDamage).toBe(330);
    expect(berserkerCast("v2c_overlord_ruin", 700).enemyDamage).toBe(468);
    expect(berserkerCast("v2c_overlord_ruin", 500).enemyDamage).toBe(561);
    expect(berserkerCast("v2c_overlord_ruin", 250).enemyDamage).toBe(676);
    expect(berserkerCast("v2c_overlord_ruin", 1).enemyDamage).toBe(791);

    const bloodslash = berserkerCast("v2c_berserker_bloodslash", 1_000);
    const bloodbath = berserkerCast("v2c_warlord_bloodbath", 700);
    expect(bloodslash.selfHpCost).toBe(100);
    expect(bloodslash.enemyDamage).toBe(208); // 명중 뒤 HP 900, 잃은 HP 10%
    expect(bloodbath.selfHpCost).toBe(105);
    expect(bloodbath.enemyDamage).toBe(295); // 명중 뒤 HP 595, 잃은 HP 40.5%
  });

  it("혈전 준비와 사망 극복 준비를 계수에 곱한 뒤 PvP에서 기여분만 60% 적용한다", () => {
    const context = {
      madnessRank: 4 as const,
      finisherReady: true,
      deathDamageReady: true,
      annihilationUsesRemaining: 1,
    };
    const pve = berserkerCast("v2c_hegemon_annihilation", 400, {
      berserker: context,
    });
    const pvp = berserkerCast("v2c_hegemon_annihilation", 400, {
      berserker: context,
      combatMode: "pvp",
    });

    expect(pve.enemyDamage).toBe(2_299); // (220+264) × (1 + 2×1.25×1.5)
    expect(pvp.enemyDamage).toBe(1_573); // (220+264) × (1 + 3.75×0.6)
    expect(pve.berserkerTransition).toEqual({
      grantFinisher: false,
      consumeFinisher: true,
      consumeDeathDamage: true,
      consumeAnnihilationUse: true,
      forceSkillCrit: true,
      bonusSkillCritDamagePct: 30,
    });
  });

  it("혈전 준비는 발동 실패 때 유지되고 실제 필살 시전은 빗나가도 소비 대상으로 남는다", () => {
    const context = {
      madnessRank: 2 as const,
      finisherReady: true,
      deathDamageReady: false,
      annihilationUsesRemaining: 1,
    };
    const failed = berserkerCast("v2c_overlord_ruin", 500, {
      berserker: context,
      procRoll: 99,
    });
    expect(failed.castSkillId).toBeNull();
    expect(failed.berserkerTransition.consumeFinisher).toBe(false);

    const fired = berserkerCast("v2c_overlord_ruin", 500, {
      berserker: context,
      procRoll: 0,
    });
    const missed = removeMissedV2SkillTargetEffects(fired);
    expect(missed.berserkerTransition.consumeFinisher).toBe(true);
    expect(missed.berserkerTransition.forceSkillCrit).toBe(true);
    expect(missed.berserkerTransition.bonusSkillCritDamagePct).toBe(30);
  });

  it("광기는 HP 50% 이하 공격 발동률에 10%p를 더하고 사망 준비 공격은 확정 발동한다", () => {
    const lowHpMadness = berserkerCast("v2c_overlord_ruin", 500, {
      procRoll: 50,
      berserker: {
        madnessRank: 1,
        finisherReady: false,
        deathDamageReady: false,
        annihilationUsesRemaining: 1,
      },
    });
    expect(lowHpMadness.castSkillId).toBe("v2c_overlord_ruin"); // 기본 44% + 광기 10%p

    const deathReady = berserkerCast("v2c_overlord_ruin", 700, {
      procRoll: 99,
      berserker: {
        madnessRank: 4,
        finisherReady: false,
        deathDamageReady: true,
        annihilationUsesRemaining: 1,
      },
    });
    expect(deathReady.castSkillId).toBe("v2c_overlord_ruin");
    expect(deathReady.berserkerTransition.consumeDeathDamage).toBe(true);
  });

  it("혈전 시전은 필살 준비를 부여하고 멸왕일도 사용 횟수 0은 커스텀 패턴도 우회하지 못한다", () => {
    const bloodbath = berserkerCast("v2c_warlord_bloodbath", 700, {
      berserker: {
        madnessRank: 1,
        finisherReady: false,
        deathDamageReady: false,
        annihilationUsesRemaining: 1,
      },
    });
    expect(bloodbath.berserkerTransition.grantFinisher).toBe(true);

    const blocked = berserkerCast("v2c_hegemon_annihilation", 100, {
      combatPattern: {
        blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_hegemon_annihilation" } }],
      },
      berserker: {
        madnessRank: 4,
        finisherReady: false,
        deathDamageReady: true,
        annihilationUsesRemaining: 0,
      },
    });
    expect(blocked.castSkillId).toBeNull();
  });

  it("광전사–패황 스마트 기본 패턴은 사망 준비→저HP 멸왕→준비된 파멸→혈전→사혈 순이다", () => {
    const equipped = [
      "v2c_berserker_bloodslash",
      "v2c_hegemon_annihilation",
      "v2c_overlord_ruin",
      "v2c_warlord_bloodbath",
    ];

    expect(smartDefaultPatternFromEquipped(equipped).blocks).toEqual([
      {
        condition: {
          kind: "any",
          conditions: [
            { kind: "self_buff_pct", target: "berserkerDeathOvercome", active: true },
            { kind: "self_hp", op: "below", pct: 25 },
          ],
        },
        action: { kind: "skill", skillId: "v2c_hegemon_annihilation" },
      },
      {
        condition: {
          kind: "all",
          conditions: [
            { kind: "self_hp", op: "below", pct: 50 },
            { kind: "self_buff_pct", target: "berserkerFinisher", active: true },
          ],
        },
        action: { kind: "skill", skillId: "v2c_overlord_ruin" },
      },
      {
        condition: {
          kind: "all",
          conditions: [
            { kind: "self_hp", op: "below", pct: 70 },
            { kind: "self_buff_pct", target: "berserkerFinisher", active: false },
          ],
        },
        action: { kind: "skill", skillId: "v2c_warlord_bloodbath" },
      },
      {
        condition: { kind: "self_hp", op: "above", pct: 70 },
        action: { kind: "skill", skillId: "v2c_berserker_bloodslash" },
      },
    ]);
  });

  it("스마트 선택은 70/50/25% 경계와 내부 준비 상태를 지킨다", () => {
    const equipped = [
      "v2c_warlord_bloodbath",
      "v2c_overlord_ruin",
      "v2c_berserker_bloodslash",
      "v2c_hegemon_annihilation",
    ];
    const combatPattern = smartDefaultPatternFromEquipped(equipped);
    const base = castInput(equipped, { combatPattern });
    const castAt = ({
      selfHp,
      enemyHp,
      finisherReady = false,
      deathDamageReady = false,
    }: {
      selfHp: number;
      enemyHp: number;
      finisherReady?: boolean;
      deathDamageReady?: boolean;
    }) =>
      resolveV2SkillCast({
        ...base,
        attacker: {
          ...base.attacker,
          currentHp: selfHp,
        },
        berserker: {
          madnessRank: 4,
          finisherReady,
          deathDamageReady,
          annihilationUsesRemaining: 1,
        },
        target: { ...base.target, currentHp: enemyHp },
      }).castSkillId;

    expect(castAt({ selfHp: 1_000, enemyHp: 1_000 })).toBe("v2c_berserker_bloodslash");
    expect(castAt({ selfHp: 700, enemyHp: 1_000 })).toBe(
      "v2c_warlord_bloodbath",
    );
    expect(castAt({ selfHp: 500, enemyHp: 1_000, finisherReady: true })).toBe(
      "v2c_overlord_ruin",
    );
    expect(castAt({ selfHp: 250, enemyHp: 1_000 })).toBe("v2c_hegemon_annihilation");
    expect(castAt({ selfHp: 700, enemyHp: 1_000, deathDamageReady: true })).toBe("v2c_hegemon_annihilation");
  });

  it("광전사–패황의 저장된 커스텀 패턴은 스마트 우선순위로 덮어쓰지 않는다", () => {
    const equipped = [
      "v2c_berserker_bloodslash",
      "v2c_warlord_bloodbath",
      "v2c_overlord_ruin",
      "v2c_hegemon_annihilation",
    ];
    const savedPattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: {
            kind: "skill",
            skillId: "v2c_hegemon_annihilation",
          },
        },
      ],
    };

    expect(
      effectiveCombatPatternFromEquipped(equipped, savedPattern),
    ).toBe(savedPattern);
  });

  it("저장 패턴에서 빠진 그림자 도약도 장착 중이면 첫 행동으로 보완한다", () => {
    const shadowStep = "v2c_shadow_shadowstep";
    const combo = "v2c_brawler_combo";
    const equipped = [combo, shadowStep];
    const savedPattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: combo },
        },
      ],
    };

    const first = resolveV2SkillCast(
      castInput(equipped, { combatPattern: savedPattern, turn: 1 }),
    );

    expect(first.castSkillId).toBe(shadowStep);
    expect(first.guaranteedEvadesToAdd).toBe(1);

    const second = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern: savedPattern,
        turn: 2,
        cooldowns: first.nextCooldowns,
      }),
    );
    expect(second.castSkillId).toBe(combo);
  });

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

  it("self_shield 수치 조건 — 현재 보호막 포인트가 기준 이하일 때만 발동한다", () => {
    const skillId = "v2c_warrior_strike";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "self_shield", op: "atMost", value: 120 },
          action: { kind: "skill", skillId },
        },
      ],
    };
    const base = castInput([skillId], {
      combatPattern: pattern,
      attacker: {
        ...castInput([skillId]).attacker,
        selfShield: 120,
        selfShieldActive: true,
      },
    });

    expect(resolveV2SkillCast(base).castSkillId).toBe(skillId);
    expect(
      resolveV2SkillCast({
        ...base,
        attacker: { ...base.attacker, selfShield: 121 },
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

  it("모든 직접 회복 스킬은 패턴 사용 여부와 관계없이 표시된 회복량을 그대로 적용한다", () => {
    const directHealSkills = Object.values(V2_SKILLS).filter(
      (skill) =>
        !skill.monsterOnly &&
        skill.effects.some((effect) => effect.kind === "heal"),
    );

    expect(directHealSkills.map((skill) => skill.id).sort()).toEqual([
      "v2_skill_recover",
      "v2c_acolyte_smite",
      "v2c_archbishop_sanctuary",
      "v2c_bishop_heal",
      "v2c_camper_camp",
      "v2c_crusader_judgment",
      "v2c_extremesurvivor_struggle",
      "v2c_fieldmedic_treatment",
      "v2c_martial_chi",
      "v2c_rescueexpert_rescue",
      "v2c_returner_survive",
      "v2c_saint_miracle",
      "v2c_survivor_firstaid",
      "v2c_templar_smite",
    ]);

    for (const skill of directHealSkills) {
      const common = castInput([skill.id], {
        procRoll: 0,
        applyProcInPattern: true,
        attacker: {
          ...castInput([skill.id]).attacker,
          mp: 10_000,
          maxMp: 10_000,
          maxHp: 10_000,
          currentHp: 4_000,
          healMult: 2,
          magicAtk: 500,
          spi: 500,
        },
        target: {
          ...castInput([skill.id]).target,
          def: 0,
        },
      });
      const direct = resolveV2SkillCast(common);
      const patterned = resolveV2SkillCast({
        ...common,
        combatPattern: {
          blocks: [
            {
              condition: { kind: "always" },
              action: { kind: "skill", skillId: skill.id },
            },
          ],
        },
      });

      expect(direct.castSkillId, skill.id).toBe(skill.id);
      expect(patterned.castSkillId, skill.id).toBe(skill.id);
      expect(patterned.selfHeal, skill.id).toBe(direct.selfHeal);
    }
  });

  it("기적은 스킬 데이터에 적힌 실효 회복량만으로 제보 전투 수치를 재현한다", () => {
    const skillId = "v2c_saint_miracle";
    const base = castInput([skillId], {
      procRoll: 0,
      applyProcInPattern: true,
      attacker: {
        ...castInput([skillId]).attacker,
        mp: 3_000,
        maxMp: 3_000,
        maxHp: 16_730,
        currentHp: 9_791,
        healMult: 10,
        spi: 122,
      },
    });
    const direct = resolveV2SkillCast(base);
    const patterned = resolveV2SkillCast({
      ...base,
      combatPattern: {
        blocks: [
          {
            condition: { kind: "always" },
            action: { kind: "skill", skillId },
          },
        ],
      },
    });

    expect(direct.selfHeal).toBe(2_789);
    expect(patterned.selfHeal).toBe(2_789);
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

  it("교대 스킬은 발동에 성공한 뒤에만 다음 스킬로 넘어간다", () => {
    const firstSkillId = "v2c_skyascendant_fallingstar";
    const secondSkillId = "v2c_skyascendant_voidbreak";
    const pairKey = `${firstSkillId}\u0000${secondSkillId}`;
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "alternate", firstSkillId, secondSkillId },
        },
      ],
    };
    const equipped = [firstSkillId, secondSkillId];

    const first = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern: pattern,
        applyProcInPattern: true,
        procRoll: 0,
        turn: 1,
      }),
    );
    expect(first.castSkillId).toBe(firstSkillId);
    expect(first.patternAlternateTransition).toEqual({
      key: pairKey,
      skillId: firstSkillId,
    });

    const failedSecond = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern: pattern,
        applyProcInPattern: true,
        procRoll: 99,
        turn: 2,
        alternateLastSkillByPair: { [pairKey]: firstSkillId },
      }),
    );
    expect(failedSecond.castSkillId).toBeNull();
    expect(failedSecond.patternAlternateTransition).toBeUndefined();

    const retriedSecond = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern: pattern,
        applyProcInPattern: true,
        procRoll: 0,
        turn: 3,
        alternateLastSkillByPair: { [pairKey]: firstSkillId },
      }),
    );
    expect(retriedSecond.castSkillId).toBe(secondSkillId);
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

  it("서로 다른 다음 순위 스킬은 독립된 발동 판정값을 사용한다", () => {
    const first = "v2c_archmage_collapse"; // 40%
    const second = "v2c_arcanist_burst"; // 45%
    const fallback = "v2c_mage_boltcast"; // 100%
    const pattern: V2CombatPattern = {
      blocks: [first, second, fallback].map((skillId) => ({
        condition: { kind: "always" },
        action: { kind: "skill", skillId },
      })),
    };

    const result = resolveV2SkillCast(
      castInput([first, second, fallback], {
        procRoll: 50, // 1순위 실패
        nextProcRoll: () => 10, // 2순위 독립 판정 성공
        combatPattern: pattern,
        applyProcInPattern: true,
      }),
    );

    expect(result.castSkillId).toBe(second);
  });

  it("같은 스킬을 중복 등록해도 한 행동에서는 발동 판정값을 공유한다", () => {
    const duplicated = "v2c_archmage_collapse"; // 40%
    const fallback = "v2c_arcanist_burst"; // 45%
    const pattern: V2CombatPattern = {
      blocks: [duplicated, duplicated, fallback].map((skillId) => ({
        condition: { kind: "always" },
        action: { kind: "skill", skillId },
      })),
    };

    const result = resolveV2SkillCast(
      castInput([duplicated, fallback], {
        procRoll: 50, // 중복된 1·2순위는 모두 실패해야 함
        nextProcRoll: () => 10, // 서로 다른 3순위만 새로 판정해 성공
        combatPattern: pattern,
        applyProcInPattern: true,
      }),
    );

    expect(result.castSkillId).toBe(fallback);
  });

  it("일반 공격 블록이 조건을 만족하면 아래 스킬 후보를 검사하지 않는다", () => {
    const pattern: V2CombatPattern = {
      blocks: [
        { condition: { kind: "always" }, action: { kind: "basic_attack" } },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } },
      ],
    };

    expect(
      resolveV2SkillCast(castInput([SKILL], { combatPattern: pattern })).castSkillId,
    ).toBeNull();
  });

  it("출혈과 혈맥 폭발 준비가 모두 맞을 때만 일반 공격하고 대기 중에는 스킬을 쓴다", () => {
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "all",
            conditions: [
              { kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 5 },
              {
                kind: "self_resource",
                resource: "bloodlineBurstReady",
                op: "atLeast",
                value: 1,
              },
            ],
          },
          action: { kind: "basic_attack" },
        },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } },
      ],
    };
    const bleedingTarget = { ...castInput([SKILL]).target, bleedStacks: 5 };

    expect(
      resolveV2SkillCast(
        castInput([SKILL], {
          combatPattern: pattern,
          attacker: {
            ...castInput([SKILL]).attacker,
            bloodlineBurstReady: true,
          },
          target: bleedingTarget,
        }),
      ).castSkillId,
    ).toBeNull();
    expect(
      resolveV2SkillCast(
        castInput([SKILL], {
          combatPattern: pattern,
          attacker: {
            ...castInput([SKILL]).attacker,
            bloodlineBurstReady: false,
          },
          target: bleedingTarget,
        }),
      ).castSkillId,
    ).toBe(SKILL);
  });

  it("스킬 발동 판정 실패 뒤 일반 공격 블록을 만나면 더 낮은 스킬로 넘어가지 않는다", () => {
    const fallback = "v2c_warrior_warcry";
    const pattern: V2CombatPattern = {
      blocks: [
        { condition: { kind: "always" }, action: { kind: "skill", skillId: SKILL } },
        { condition: { kind: "always" }, action: { kind: "basic_attack" } },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: fallback } },
      ],
    };

    expect(
      resolveV2SkillCast(
        castInput([SKILL, fallback], {
          procRoll: 99,
          combatPattern: pattern,
          applyProcInPattern: true,
        }),
      ).castSkillId,
    ).toBeNull();
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

  it("역할 사용은 첫 장착 스킬이 사용 불가하면 다음 패턴 블록으로 넘어간다", () => {
    const shield = "v2c_mage_shield";
    const bolt = "v2c_mage_boltcast";
    const meditate = "v2c_mage_meditate";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "self_shield", active: false },
          action: { kind: "role", role: "buff" },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: bolt },
        },
      ],
    };
    const base = castInput([shield, bolt, meditate], {
      combatPattern: pattern,
    });

    const result = resolveV2SkillCast({
      ...base,
      attacker: { ...base.attacker, mp: 0 },
    });

    expect(result.castSkillId).toBe(bolt);
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

  it("대상의 현재 한기 스택으로 빙결술사 스킬 우선순위를 고른다", () => {
    const skills = [
      "v2c_cryomancer_absolutezero",
      "v2c_frostmage_glacier",
    ];
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "enemy_status",
            tag: "frostChill",
            op: "atLeast",
            stacks: 2,
          },
          action: { kind: "skill", skillId: "v2c_cryomancer_absolutezero" },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: "v2c_frostmage_glacier" },
        },
      ],
    };
    const base = castInput(skills, { combatPattern: pattern });

    expect(
      resolveV2SkillCast({
        ...base,
        target: { ...base.target, frostChillStacks: 2 },
      }).castSkillId,
    ).toBe("v2c_cryomancer_absolutezero");
    expect(
      resolveV2SkillCast({
        ...base,
        target: { ...base.target, frostChillStacks: 1 },
      }).castSkillId,
    ).toBe("v2c_frostmage_glacier");
  });

  it("대상의 남은 중독 피해 횟수로 만독개화 갱신 시점을 고른다", () => {
    const refresh = "v2c_myriadvenom_mutation";
    const pattern: V2CombatPattern = {
      blocks: [
        {
          condition: {
            kind: "enemy_status",
            tag: "poison",
            metric: "remainingTurns",
            op: "atMost",
            stacks: 2,
          },
          action: { kind: "skill", skillId: refresh },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: SKILL },
        },
      ],
    };
    const base = castInput([refresh, SKILL], { combatPattern: pattern });

    expect(
      resolveV2SkillCast({
        ...base,
        target: {
          ...base.target,
          poisonStacks: 6,
          poisonTurns: 2,
        },
      }).castSkillId,
    ).toBe(refresh);
    expect(
      resolveV2SkillCast({
        ...base,
        target: {
          ...base.target,
          poisonStacks: 6,
          poisonTurns: 3,
        },
      }).castSkillId,
    ).toBe(SKILL);
  });
});

describe("resolveV2SkillCast — 수집형 변이 자원", () => {
  const castMutation = (
    skillId: string,
    resources: { weight?: number; bleed?: number } = {},
    attacker: Partial<V2SkillCastInput["attacker"]> = {},
  ) => {
    const base = castInput([skillId]);
    return resolveV2SkillCast({
      ...base,
      attacker: {
        ...base.attacker,
        def: 100,
        vit: 100,
        magicAtk: 100,
        mutationWeight: resources.weight ?? 0,
        ...attacker,
      },
      target: {
        ...base.target,
        def: 0,
        magicDef: 0,
        bleedStacks: resources.bleed ?? 0,
      },
    });
  };

  it("수인 공격은 플레이어 출혈 계수로 각각 1·2중첩만 부여한다", () => {
    const rend = castMutation("v2c_beastkin_rend");
    const flurry = castMutation("v2c_beastkin_clawflurry");

    expect(rend.dotsToApplyToTarget).toContainEqual(
      expect.objectContaining({
        tag: "bleed",
        stacks: 1,
        atkCoefPerStack: 0.25,
      }),
    );
    expect(flurry.dotsToApplyToTarget).toContainEqual(
      expect.objectContaining({
        tag: "bleed",
        stacks: 2,
        atkCoefPerStack: 0.25,
      }),
    );
  });

  it("암석 강타는 피해 뒤 중량을 얻고 지각 붕괴는 빗나가도 기존 중량을 소비한다", () => {
    expect(
      castMutation("v2c_golem_rocksmash", { weight: 2 })
        .mutationTransition,
    ).toMatchObject({ weightAfter: 3, weightGained: 1 });

    const collapse = castMutation("v2c_golem_tectoniccollapse", {
      weight: 3,
    });
    expect(collapse.enemyDamage).toBeGreaterThan(0);
    expect(collapse.mutationTransition).toMatchObject({
      weightAfter: 0,
      weightConsumed: 3,
    });
    expect(removeMissedV2SkillTargetEffects(collapse).mutationTransition)
      .toEqual(collapse.mutationTransition);
  });

  it("중량과 피 냄새는 직접 물리 스킬만 강화하고 마법에는 적용하지 않는다", () => {
    const physical = castMutation("v2c_warrior_strike");
    const weighted = castMutation("v2c_warrior_strike", { weight: 3 });
    expect(weighted.enemyDamage).toBe(Math.floor(physical.enemyDamage * 1.15));

    const scented = castMutation(
      "v2c_warrior_strike",
      { bleed: 10 },
      { bleedPhysicalSkillDamagePctPerStack: 2 },
    );
    expect(scented.enemyDamage).toBe(Math.floor(physical.enemyDamage * 1.2));

    const magic = castMutation("v2c_mage_boltcast", { weight: 3, bleed: 10 });
    const magicWithPassive = castMutation(
      "v2c_mage_boltcast",
      { weight: 3, bleed: 10 },
      { bleedPhysicalSkillDamagePctPerStack: 2 },
    );
    expect(magicWithPassive.enemyDamage).toBe(magic.enemyDamage);
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

  it("순수 공격 스킬의 주스탯 계수는 기존보다 15% 높다", () => {
    const result = resolveV2SkillCast(
      castInput(["v2c_warrior_strike"], {
        procRoll: 0,
        attacker: {
          ...castInput(["v2c_warrior_strike"]).attacker,
          atk: 170,
          str: 200,
        },
        target: {
          ...castInput(["v2c_warrior_strike"]).target,
          def: 0,
        },
      }),
    );

    expect(result.enemyDamage).toBe(222);
  });

  it("특화 공격 스킬의 직접 스탯 계수는 기존보다 15% 높다", () => {
    const result = resolveV2SkillCast(
      castInput(["v2c_shieldman_bash"], {
        procRoll: 0,
        attacker: {
          ...castInput(["v2c_shieldman_bash"]).attacker,
          atk: 100,
          def: 200,
        },
        target: {
          ...castInput(["v2c_shieldman_bash"]).target,
          def: 0,
        },
      }),
    );

    expect(result.enemyDamage).toBe(438);
  });

  it("장벽술은 방어력 직접 공격 계수만 15% 높인다", () => {
    const base = castInput(["v2c_shieldman_bash"]);
    const result = resolveV2SkillCast({
      ...base,
      procRoll: 0,
      attacker: {
        ...base.attacker,
        atk: 100,
        def: 200,
        fortressDefSkillStatCoefPct: 15,
      },
      target: { ...base.target, def: 0 },
    });

    expect(result.enemyDamage).toBe(488);
  });

  it("충격 3스택은 스택당 15% 또는 20% 최종 피해를 주고 적중 소비를 알린다", () => {
    const cast = (pct: number) => {
      const base = castInput(["v2c_shieldman_bash"]);
      return resolveV2SkillCast({
        ...base,
        procRoll: 0,
        attacker: {
          ...base.attacker,
          atk: 100,
          def: 200,
          fortressImpact: 3,
          fortressImpactDamagePctPerStack: pct,
        },
        target: { ...base.target, def: 0 },
      });
    };

    expect(cast(15)).toMatchObject({
      enemyDamage: 635,
      fortressImpactToConsume: 3,
    });
    expect(cast(20)).toMatchObject({
      enemyDamage: 700,
      fortressImpactToConsume: 3,
    });
    expect(removeMissedV2SkillTargetEffects(cast(20))).toMatchObject({
      enemyDamage: 0,
      fortressImpactToConsume: 0,
    });
  });

  it("철벽 태세 시전 결과는 반사 횟수 3회를 갱신한다", () => {
    const result = resolveV2SkillCast(
      castInput(["v2c_ironknight_guard"], { procRoll: 0 }),
    );

    expect(result.castSkillId).toBe("v2c_ironknight_guard");
    expect(result.ironWallReflectToApply).toEqual({
      charges: 3,
      damageReductionPct: 30,
      reflectDefPct: 180,
    });
  });

  it("성채기사 스마트 기본 패턴은 충격 3 성채 충각 뒤 빈 철벽 태세를 둔다", () => {
    expect(
      smartDefaultPatternFromEquipped([
        "v2c_ironknight_guard",
        "v2c_fortressknight_ram",
      ]).blocks,
    ).toEqual([
      {
        condition: {
          kind: "self_resource",
          resource: "impact",
          op: "atLeast",
          value: 3,
        },
        action: { kind: "skill", skillId: "v2c_fortressknight_ram" },
      },
      {
        condition: {
          kind: "self_resource",
          resource: "ironWallReflect",
          op: "none",
          value: 0,
        },
        action: { kind: "skill", skillId: "v2c_ironknight_guard" },
      },
    ]);
  });

  it("회복 스킬은 상세에 표시되는 실효 스탯 계수와 고정값을 적용한다", () => {
    const result = resolveV2SkillCast(
      castInput(["v2c_acolyte_smite"], {
        procRoll: 0,
        attacker: {
          ...castInput(["v2c_acolyte_smite"]).attacker,
          magicAtk: 100,
          currentHp: 1_000,
          healMult: 1,
        },
      }),
    );

    expect(result.selfHeal).toBe(23);
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

  it("완성된 원소공명은 선택 주문식 재료의 독립 시전을 막고 주력기를 시전한다", () => {
    const equipped = [
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
      "v2c_firemage_inferno",
      "v2c_windmage_tempest",
    ];
    const combatPattern: V2CombatPattern = {
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: "v2c_firemage_inferno" },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: "v2c_elementallord_surge" },
        },
      ],
    };

    const result = resolveV2SkillCast(castInput(equipped, { combatPattern }));
    expect(result.castSkillId).toBe("v2c_elementallord_surge");
    expect(result.castSkillName).toBe("화염폭풍");

    const broken = resolveV2SkillCast(
      castInput(equipped.filter((id) => id !== "v2c_elementallord_resonance"), {
        combatPattern,
      }),
    );
    expect(broken.castSkillId).toBe("v2c_firemage_inferno");
  });

  it("선택 주문식에 쓰이지 않은 원소 주문은 독립 시전 후보로 남는다", () => {
    const equipped = [
      "v2c_elementallord_surge",
      "v2c_elementallord_resonance",
      "v2c_firemage_inferno",
      "v2c_windmage_tempest",
      "v2c_frostmage_glacier",
    ];
    const result = resolveV2SkillCast(
      castInput(equipped, {
        combatPattern: {
          blocks: [
            {
              condition: { kind: "always" },
              action: { kind: "skill", skillId: "v2c_frostmage_glacier" },
            },
            {
              condition: { kind: "always" },
              action: { kind: "skill", skillId: "v2c_elementallord_surge" },
            },
          ],
        },
      }),
    );

    expect(result.castSkillId).toBe("v2c_frostmage_glacier");
  });

  it("오원소 폭주 촉매는 태초회귀에 직접 마법 피해를 정확히 한 번 추가한다", () => {
    const baseSkills = [
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
      "v2c_firemage_inferno",
      "v2c_windmage_tempest",
    ];
    const shared = {
      attacker: {
        ...castInput(baseSkills).attacker,
        atk: 100,
        magicAtk: 135,
        int: 100,
      },
      target: {
        ...castInput(baseSkills).target,
        def: 0,
        magicDef: 0,
      },
    };
    const base = resolveV2SkillCast(castInput(baseSkills, shared));
    const catalyst = resolveV2SkillCast(
      castInput([...baseSkills, "v2c_elementallord_surge"], shared),
    );

    expect(base.castSkillName).toBe("태초의 화염폭풍");
    expect(catalyst.castSkillName).toBe("태초의 화염폭풍");
    expect(catalyst.hitDamages).toHaveLength(base.hitDamages.length + 1);
    expect(catalyst.enemyDamage - base.enemyDamage).toBe(52);
  });

  it("동일 40 SP에서 태초술사 개벽 직타는 천궁·흑월 중앙값보다 5~10% 강하다", () => {
    const primordial = [
      "v2c_primordialmage_return",
      "v2c_primordialmage_resonance",
      "v2c_elementallord_surge",
      ...elemental,
      "v2c_primordialmage_amplification",
    ] as const;
    const heavenlyBow = [
      "v2c_heavenlybow_orbit",
      "v2c_heavenlybow_starpath",
      "v2c_marksman_aim",
      "v2c_archer_agility",
      "v2c_assassin_fortune",
      "v2c_shadow_lethality3",
    ] as const;
    const blackMoon = [
      "v2c_blackmoon_flurry",
      "v2c_blackmoon_dominion",
      "v2c_blackmoon_weakpoint3",
      "v2c_shadow_lethality3",
    ] as const;
    const builds = [primordial, heavenlyBow, blackMoon];
    for (const equipped of builds) {
      expect(
        resolveElementalResonanceLoadout({ learned: equipped, equipped }).spUsed,
      ).toBe(40);
    }

    const expectedDirectDamage = (equipped: typeof builds[number]) => {
      const result = resolveV2SkillCast(
        castInput([...equipped], {
          attacker: {
            ...castInput([...equipped]).attacker,
            atk: 1_350,
            magicAtk: 1_350,
            str: 1_000,
            int: 1_000,
            dex: 1_000,
            luk: 1_000,
            spi: 1_000,
            allStatTotal: 6_000,
            maxHp: 10_000,
            currentHp: 10_000,
          },
          target: {
            ...castInput([...equipped]).target,
            def: 1_000,
            magicDef: 1_000,
            currentHp: 5_000,
            maxHp: 10_000,
          },
        }),
      );
      const procChance = V2_SKILLS[result.castSkillId!].procChance ?? 100;
      return result.enemyDamage * (procChance / 100);
    };
    const primordialDamage = expectedDirectDamage(primordial);
    const comparisonMedian =
      (expectedDirectDamage(heavenlyBow) + expectedDirectDamage(blackMoon)) / 2;

    expect(primordialDamage).toBeGreaterThanOrEqual(comparisonMedian * 1.05);
    expect(primordialDamage).toBeLessThanOrEqual(comparisonMedian * 1.1);
  });
});
