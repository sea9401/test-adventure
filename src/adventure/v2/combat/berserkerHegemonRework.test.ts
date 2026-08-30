import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import {
  applyEnemyV2SkillCast,
  applyPlayerV2SkillCast,
  finishEnemyAttack,
  initialBattleState,
  type BattleState,
  type PlayerCombat,
} from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";

afterEach(() => vi.restoreAllMocks());

const enemy: Monster = {
  name: "패황 시험목",
  tags: [],
  hp: 1_000_000,
  atk: 2_000,
  def: 0,
  spd: 1,
  exp: 0,
  evasionPct: 0,
  accuracy: 100,
};

const player: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  maxMp: 99_999,
  mp: 99_999,
  atk: 100,
  strStat: 100,
  def: 0,
  spd: 100,
  evasionPct: 0,
  evaRating: 0,
  accuracyPct: 100,
  accRating: 100,
  attackCount: 1,
  critChancePct: 0,
  berserkerMadnessRank: 4,
};

const lineage = [
  "v2c_berserker_bloodslash",
  "v2c_warlord_bloodbath",
  "v2c_overlord_ruin",
  "v2c_hegemon_annihilation",
] as const;

function cast(state: BattleState): BattleState {
  return applyPlayerV2SkillCast(
    state,
    player,
    {
      selfBuffs: state.v2SelfBuffs,
      selfDebuffs: state.v2SelfDebuffs,
      enemyDebuffs: state.enemyV2Debuffs,
    },
    "패황",
  ).state;
}

describe("광전사–패황 PvE 통합", () => {
  it("사혈격→혈전→파멸일격→일반 멸왕일도→사망 극복→강화 멸왕일도를 잇는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    let state = initialBattleState(player, enemy, "패황", {
      learned: [...lineage],
      equipped: [...lineage],
    });
    expect(state.berserker).toMatchObject({
      finisherReady: false,
      deathOvercomeUsed: false,
      annihilationUsesRemaining: 1,
    });

    state = cast(state); // HP 100%: 사혈격
    expect(state.playerHp).toBe(900);
    expect(state.log.at(-2)?.text ?? state.log.at(-1)?.text).toContain("사혈격");

    state = cast({ ...state, playerHp: 700 }); // HP 70%: 혈전
    expect(state.playerHp).toBe(595);
    expect(state.berserker?.finisherReady).toBe(true);
    expect(state.log.some((entry) => entry.text.includes("[혈전]"))).toBe(true);

    state = cast({ ...state, playerHp: 500 }); // 준비 + HP 50%: 파멸일격
    expect(state.berserker?.finisherReady).toBe(false);
    expect(
      state.log.some(
        (entry) => entry.text.includes("파멸일격") && entry.text.includes("[치명타]"),
      ),
    ).toBe(true);

    state = cast({ ...state, playerHp: 250 }); // HP 25%: 일반 멸왕일도
    expect(state.berserker?.annihilationUsesRemaining).toBe(0);

    state = resolveEnemyPhase(
      {
        ...state,
        playerHp: 100,
        phase: "enemy",
        turn: { ...state.turn, enemyAttacksLeft: 1 },
      },
      player,
      "패황",
      true,
    );
    expect(state.playerHp).toBe(400);
    expect(state.flags.enduranceTriggered).toBe(false);
    expect(state.berserker).toMatchObject({
      deathOvercomeUsed: true,
      deathDamageReady: true,
      annihilationUsesRemaining: 1,
    });
    expect(state.log.some((entry) => entry.text.includes("[사망 극복]"))).toBe(true);

    state = cast({ ...state, phase: "player" });
    expect(state.berserker).toMatchObject({
      deathDamageReady: false,
      annihilationUsesRemaining: 0,
      guardUntil: "none",
    });
    expect(state.log.some((entry) => entry.text.includes("[패황의 지배]"))).toBe(true);
  });

  it("광기의 왕좌 사망 극복은 일반 불굴보다 먼저 발동한다", () => {
    const thronePlayer: PlayerCombat = {
      ...player,
      hp: 100,
      berserkerMadnessRank: 3,
      enduranceActive: true,
    };
    let state = initialBattleState(thronePlayer, enemy, "패왕");
    state = resolveEnemyPhase(
      {
        ...state,
        phase: "enemy",
        turn: { ...state.turn, enemyAttacksLeft: 1 },
      },
      thronePlayer,
      "패왕",
      true,
    );

    expect(state.playerHp).toBe(200);
    expect(state.flags.enduranceTriggered).toBe(false);
    expect(state.berserker?.deathOvercomeUsed).toBe(true);
  });

  it("몬스터 V2 스킬의 치명상에도 사망 극복이 먼저 발동한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const skillEnemy: Monster = {
      ...enemy,
      v2MaxMp: 30,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
    };
    const thronePlayer: PlayerCombat = {
      ...player,
      hp: 100,
      berserkerMadnessRank: 3,
      enduranceActive: true,
    };
    const initial = initialBattleState(thronePlayer, skillEnemy, "패왕");

    const castResult = applyEnemyV2SkillCast(initial, thronePlayer);
    const state = finishEnemyAttack(castResult.state);

    expect(castResult.castFired).toBe(true);
    expect(state.playerHp).toBe(200);
    expect(state.flags.enduranceTriggered).toBe(false);
    expect(state.berserker).toMatchObject({
      deathOvercomeUsed: true,
      guardUntil: "none",
    });
  });

  it("3단계 보호는 현재 적 행동 뒤 끝나고 다음 치명상은 일반 불굴이 받는다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const thronePlayer: PlayerCombat = {
      ...player,
      hp: 100,
      berserkerMadnessRank: 3,
      enduranceActive: true,
    };
    let state = initialBattleState(thronePlayer, enemy, "패왕");

    state = resolveEnemyPhase(
      {
        ...state,
        phase: "enemy",
        turn: { ...state.turn, enemyAttacksLeft: 1 },
      },
      thronePlayer,
      "패왕",
      true,
    );
    expect(state).toMatchObject({
      playerHp: 200,
      phase: "player",
      berserker: { guardUntil: "none" },
    });

    state = resolveEnemyPhase(
      {
        ...state,
        phase: "enemy",
        turn: { ...state.turn, enemyAttacksLeft: 1 },
      },
      thronePlayer,
      "패왕",
      true,
    );
    expect(state.playerHp).toBe(1);
    expect(state.flags.enduranceTriggered).toBe(true);
    expect(state.log.some((entry) => entry.text.includes("[불굴]"))).toBe(true);
  });
});
