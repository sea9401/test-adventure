import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { healingAfterReceivedMultiplier } from "./combatShared";
import { initialBattleState, playerPveEvasionReductionPct } from "./engine";
import {
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
  playerPvpEvasionReductionPct,
} from "./engine-pvp";
import type { PlayerCombat } from "./engineState";

const BASE_PLAYER: PlayerCombat = {
  hp: 100,
  maxHp: 100_000,
  mp: 10_000,
  maxMp: 10_000,
  atk: 100,
  magicAtk: 100,
  def: 100,
  spd: 100,
  evaRating: 500,
  accRating: 500,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  critChancePct: 0,
  critMult: 2,
};

const ENEMY: Monster = {
  name: "해방 시험체",
  tags: [],
  hp: 100_000,
  atk: 100,
  def: 100,
  spd: 1,
  accuracy: 500,
  exp: 0,
  drops: [],
};

afterEach(() => vi.restoreAllMocks());

describe("장비 해방 전투 효과", () => {
  it("받는 회복량은 최종 산출값에 한 번만 적용하고 무옵션 경로를 보존한다", () => {
    expect(healingAfterReceivedMultiplier(123)).toBe(123);
    expect(healingAfterReceivedMultiplier(123, 1)).toBe(123);
    expect(healingAfterReceivedMultiplier(123, 1.2)).toBe(147);
  });

  it("주는 회복량과 받는 회복량을 자기 회복에 서로 다른 배율로 적용한다", () => {
    const skills: V2SkillsState = {
      learned: ["v2c_survivor_firstaid"],
      equipped: ["v2c_survivor_firstaid"],
    };
    const heal = (player: PlayerCombat) => {
      const state = initialBattleStatePvP(
        player,
        BASE_PLAYER,
        "P1",
        "P2",
        skills,
        { learned: [], equipped: [] },
      );
      return castV2SkillOnAttackerTurnPvP(state, "p1").state.p1.hp - player.hp;
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const base = heal({ ...BASE_PLAYER, healMult: 1 });
    const output = heal({ ...BASE_PLAYER, healMult: 1.2 });
    const received = heal({
      ...BASE_PLAYER,
      healMult: 1,
      receivedHealMult: 1.2,
    });
    const both = heal({
      ...BASE_PLAYER,
      healMult: 1.2,
      receivedHealMult: 1.2,
    });

    expect(output).toBeGreaterThan(base);
    expect(received).toBe(Math.floor(base * 1.2));
    expect(both).toBe(Math.floor(output * 1.2));
  });

  it("최종 회피 효과를 PvE와 PvP 경감에 더하고 85%에서 제한한다", () => {
    const plainPvEState = initialBattleState(BASE_PLAYER, ENEMY, "P1");
    const plainPvE = playerPveEvasionReductionPct(plainPvEState, BASE_PLAYER);
    const boostedPlayer = {
      ...BASE_PLAYER,
      finalEvasionReductionPctAdd: 5,
    };
    const boostedPvEState = initialBattleState(boostedPlayer, ENEMY, "P1");
    expect(playerPveEvasionReductionPct(boostedPvEState, boostedPlayer)).toBe(
      Math.min(85, plainPvE + 5),
    );

    const plainPvPState = initialBattleStatePvP(
      BASE_PLAYER,
      BASE_PLAYER,
      "P1",
      "P2",
    );
    const boostedPvPState = initialBattleStatePvP(
      { ...BASE_PLAYER, finalEvasionReductionPctAdd: 100 },
      BASE_PLAYER,
      "P1",
      "P2",
    );
    expect(playerPvpEvasionReductionPct(boostedPvPState, "p1")).toBe(85);
    expect(playerPvpEvasionReductionPct(plainPvPState, "p1")).toBeLessThan(85);
  });

  it("전투 시작 보호막은 최대 HP 비율을 실제 전투 스택에 생성한다", () => {
    const state = initialBattleState(
      { ...BASE_PLAYER, enchantBarrierPctMaxHp: 8 },
      ENEMY,
      "P1",
    );
    expect(state.stacks.playerShield).toBe(8_000);
  });
});
