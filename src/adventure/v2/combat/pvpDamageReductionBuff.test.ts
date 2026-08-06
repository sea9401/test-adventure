import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCombat } from "./engine";
import {
  advanceTurnPvP,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  type PvPBattleState,
} from "./engine-pvp";

const CRIMSON_JUDGMENT = "v2c_crimsontemplar_judgment";
const ATTACK_SKILL = "v2c_warrior_flurry";

const crimsonTemplar: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  atk: 30,
  def: 50,
  spd: 60,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
  maxMp: 1_000,
  mp: 1_000,
  vitStat: 100,
  classTier: 4,
};

const attacker: PlayerCombat = {
  hp: 2_000,
  maxHp: 2_000,
  atk: 150,
  def: 0,
  spd: 30,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
  maxMp: 1_000,
  mp: 1_000,
};

function castCrimsonJudgment(): PvPBattleState {
  const state = initialBattleStatePvP(
    crimsonTemplar,
    attacker,
    "진홍성기사",
    "공격자",
    { learned: [CRIMSON_JUDGMENT], equipped: [CRIMSON_JUDGMENT] },
    { learned: [ATTACK_SKILL], equipped: [ATTACK_SKILL] },
  );
  return castV2SkillOnAttackerTurnPvP(state, "p1").state;
}

function withoutDamageReduction(state: PvPBattleState): PvPBattleState {
  return {
    ...state,
    p1: {
      ...state.p1,
      stacks: {
        ...state.p1.stacks,
        skillDmgReducePct: 0,
        skillDmgReduceTurns: 0,
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("PvP 액티브 받는 피해 감소", () => {
  it("진홍 심판 시전 시 8% 피해 감소를 3행동 동안 등록하고 알린다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const state = castCrimsonJudgment();

    expect(state.p1.stacks).toMatchObject({
      skillDmgReducePct: 8,
      skillDmgReduceTurns: 3,
    });
    expect(
      state.log.some((entry) =>
        entry.text.includes("[진홍 심판] 받는 피해 -8% (3행동)"),
      ),
    ).toBe(true);
  });

  it("활성 중에는 상대의 평타와 액티브 스킬 피해를 모두 줄인다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const castState = castCrimsonJudgment();
    const attackState: PvPBattleState = {
      ...castState,
      phase: "p2",
      p1: { ...castState.p1, hp: crimsonTemplar.maxHp },
      p2: {
        ...castState.p2,
        attacksLeft: 1,
        turn: { ...castState.p2.turn, firstAttackPending: true },
      },
    };

    random.mockReturnValue(0.99);
    const reducedBasic = advanceTurnPvP(attackState);
    const normalBasic = advanceTurnPvP(withoutDamageReduction(attackState));
    expect(reducedBasic.p1.hp).toBeGreaterThan(normalBasic.p1.hp);

    random.mockReturnValue(0.1);
    const skillInput = {
      ...attackState,
      p1: { ...attackState.p1, hp: crimsonTemplar.maxHp },
    };
    const reducedSkill = castV2SkillOnAttackerTurnPvP(skillInput, "p2").state;
    const normalSkill = castV2SkillOnAttackerTurnPvP(
      withoutDamageReduction(skillInput),
      "p2",
    ).state;
    expect(reducedSkill.p1.hp).toBeGreaterThan(normalSkill.p1.hp);
  });
});
