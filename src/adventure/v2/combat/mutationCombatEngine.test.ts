import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId, V2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import {
  attackerFacingDef,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import { effectivePlayerSpd } from "./engine.atb";
import { effectiveSideSpd } from "./engine.pvp-atb";
import { resolveEnemyPhase } from "./engine.enemyPhase";

const PLAYER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  mp: 1_000,
  maxMp: 1_000,
  atk: 100,
  magicAtk: 100,
  def: 100,
  vitStat: 100,
  spd: 50,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const ENEMY: Monster = {
  name: "훈련 표적",
  tags: [],
  hp: 100_000,
  atk: 1,
  def: 0,
  spd: 1,
  exp: 0,
};

const skills = (id: V2SkillId): V2SkillsState => ({
  learned: [id],
  equipped: [id],
});

afterEach(() => vi.restoreAllMocks());

describe("PvE mutation resource transitions", () => {
  const cast = (id: V2SkillId, weight = 0) => {
    const initial = initialBattleState(PLAYER, ENEMY, "수집가", skills(id));
    const state = {
      ...initial,
      stacks: { ...initial.stacks, mutationWeight: weight },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);
    return applyPlayerV2SkillCast(state, PLAYER, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    }).state;
  };

  it("중량 생성·소비를 상태와 로그에 반영한다", () => {
    const gained = cast("v2c_golem_rocksmash", 1);
    expect(gained.stacks.mutationWeight).toBe(2);
    expect(gained.log.some((entry) => entry.text === "[중량] +1 (2/3)"))
      .toBe(true);

    const consumed = cast("v2c_golem_tectoniccollapse", 3);
    expect(consumed.stacks.mutationWeight).toBe(0);
    expect(consumed.log.some((entry) => entry.text === "[지각 붕괴] 중량 3 소모"))
      .toBe(true);
  });
});

describe("PvP mutation resource transitions", () => {
  const cast = (id: V2SkillId, weight = 0) => {
    const initial = initialBattleStatePvP(
      PLAYER,
      PLAYER,
      "P1",
      "P2",
      skills(id),
      { learned: [], equipped: [] },
    );
    const state = {
      ...initial,
      p1: {
        ...initial.p1,
        stacks: {
          ...initial.p1.stacks,
          mutationWeight: weight,
        },
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);
    return castV2SkillOnAttackerTurnPvP(state, "p1").state;
  };

  it("양쪽 엔진이 같은 중량 전이 계약을 사용한다", () => {
    const weight = cast("v2c_golem_rocksmash", 2);
    expect(weight.p1.stacks.mutationWeight).toBe(3);
    expect(weight.log.some((entry) => entry.text === "[중량] +1 (3/3)"))
      .toBe(true);
  });
});

describe("mutation effective combat stats", () => {
  it("중량 3은 PvE/PvP 실효 속도를 15% 낮춘다", () => {
    const pve = initialBattleState(PLAYER, ENEMY, "P1");
    const weightedPve = {
      ...pve,
      stacks: { ...pve.stacks, mutationWeight: 3 },
    };
    expect(effectivePlayerSpd(PLAYER, weightedPve)).toBe(42.5);

    const pvp = initialBattleStatePvP(PLAYER, PLAYER, "P1", "P2");
    const weightedPvp = {
      ...pvp,
      p1: {
        ...pvp.p1,
        stacks: { ...pvp.p1.stacks, mutationWeight: 3 },
      },
    };
    expect(effectiveSideSpd(weightedPvp, "p1")).toBe(42.5);
  });

  it("돌가죽은 PvP 방어 경계에서 중량당 방어력 6%를 적용한다", () => {
    const stone = { ...PLAYER, stoneskinDefPctPerWeight: 6 };
    const state = initialBattleStatePvP(PLAYER, stone, "P1", "P2");
    const weighted = {
      ...state,
      p2: {
        ...state.p2,
        stacks: { ...state.p2.stacks, mutationWeight: 3 },
      },
    };
    expect(attackerFacingDef(weighted.p1, weighted.p2)).toBe(118);
  });

  it("돌가죽은 PvE에서 적의 직접 물리 피해도 줄인다", () => {
    const stone = { ...PLAYER, stoneskinDefPctPerWeight: 6 };
    const enemy = { ...ENEMY, atk: 500, spd: 99 };
    const initial = initialBattleState(stone, enemy, "P1");
    const plain = resolveEnemyPhase(initial, stone, "P1", true);
    const weighted = resolveEnemyPhase(
      {
        ...initial,
        stacks: { ...initial.stacks, mutationWeight: 3 },
      },
      stone,
      "P1",
      true,
    );
    expect(weighted.playerHp).toBeGreaterThan(plain.playerHp);
  });
});
