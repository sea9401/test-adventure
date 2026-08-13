import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerCombat } from "./engine";
import {
  advanceTurnPvP,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  playerPvpEvasionReductionPct,
  type PvPBattleState,
} from "./engine-pvp";

const BLACKMOON_FLURRY = "v2c_blackmoon_flurry";
const ATTACK_SKILL = "v2c_warrior_flurry";

const blackmoon: PlayerCombat = {
  hp: 100_000,
  maxHp: 100_000,
  atk: 80,
  def: 20,
  spd: 100,
  lukStat: 200,
  evaRating: 500,
  accRating: 500,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  maxMp: 10_000,
  mp: 10_000,
};

const opponent: PlayerCombat = {
  hp: 100_000,
  maxHp: 100_000,
  atk: 400,
  def: 20,
  spd: 50,
  evaRating: 0,
  accRating: 400,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  maxMp: 10_000,
  mp: 10_000,
};

function castBlackmoon(): PvPBattleState {
  const initial = initialBattleStatePvP(
    blackmoon,
    opponent,
    "암월",
    "상대",
    { learned: [BLACKMOON_FLURRY], equipped: [BLACKMOON_FLURRY] },
    { learned: [ATTACK_SKILL], equipped: [ATTACK_SKILL] },
  );
  return castV2SkillOnAttackerTurnPvP(initial, "p1").state;
}

function withoutAccuracyDown(state: PvPBattleState): PvPBattleState {
  return {
    ...state,
    p2: {
      ...state.p2,
      stacks: {
        ...state.p2.stacks,
        accuracyDownPct: 0,
        accuracyDownTurns: 0,
      },
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("PvP 적중도 감소", () => {
  it("암월난무가 상대에게 적중도 감소 28%를 3행동 동안 등록하고 알린다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);

    const state = castBlackmoon();

    expect(state.p2.stacks).toMatchObject({
      accuracyDownPct: 28,
      accuracyDownTurns: 3,
    });
    expect(
      state.log.some((entry) =>
        entry.text.includes("[암월난무] 상대 적중도 −28% (3행동)"),
      ),
    ).toBe(true);
  });

  it("활성 중에는 상대의 일반 공격 적중도를 낮춰 회피 경감량을 높인다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const castState = castBlackmoon();
    const attackState: PvPBattleState = {
      ...castState,
      phase: "p2",
      p1: { ...castState.p1, hp: blackmoon.maxHp },
      p2: {
        ...castState.p2,
        attacksLeft: 1,
        turn: { ...castState.p2.turn, firstAttackPending: true },
      },
    };
    const normalState = withoutAccuracyDown(attackState);

    expect(playerPvpEvasionReductionPct(attackState, "p1")).toBeGreaterThan(
      playerPvpEvasionReductionPct(normalState, "p1"),
    );

    const reduced = advanceTurnPvP(attackState);
    const normal = advanceTurnPvP(normalState);
    expect(reduced.p1.hp).toBeGreaterThan(normal.p1.hp);
  });

  it("활성 중에는 상대의 액티브 스킬 적중도도 낮춘다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const castState = castBlackmoon();
    const attackState: PvPBattleState = {
      ...castState,
      phase: "p2",
      p1: { ...castState.p1, hp: blackmoon.maxHp },
    };

    const reduced = castV2SkillOnAttackerTurnPvP(attackState, "p2").state;
    const normal = castV2SkillOnAttackerTurnPvP(
      withoutAccuracyDown(attackState),
      "p2",
    ).state;

    expect(reduced.p1.hp).toBeGreaterThan(normal.p1.hp);
  });

  it("남은 지속시간은 영향을 받는 캐릭터의 행동마다 1씩 감소한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = initialBattleStatePvP(
      blackmoon,
      opponent,
      "암월",
      "상대",
      { learned: [], equipped: [] },
      { learned: [], equipped: [] },
    );
    state = {
      ...state,
      p2: {
        ...state.p2,
        stacks: {
          ...state.p2.stacks,
          accuracyDownPct: 28,
          accuracyDownTurns: 3,
        },
      },
    };

    state = castV2SkillOnAttackerTurnPvP(state, "p2").state;
    expect(state.p2.stacks.accuracyDownTurns).toBe(2);
    state = castV2SkillOnAttackerTurnPvP(state, "p2").state;
    expect(state.p2.stacks.accuracyDownTurns).toBe(1);
    state = castV2SkillOnAttackerTurnPvP(state, "p2").state;
    expect(state.p2.stacks.accuracyDownTurns).toBe(0);
    expect(state.p2.stacks.accuracyDownPct).toBe(28);
  });
});
