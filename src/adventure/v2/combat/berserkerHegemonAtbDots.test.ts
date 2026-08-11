import { describe, expect, it } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { initialBattleState, type PlayerCombat } from "./engine";
import { tickPlayerDotsOnAction } from "./engine.atb";
import { makePoisonDot } from "./combatShared";

const enemy: Monster = {
  name: "지속 피해 시험목",
  tags: [],
  hp: 10_000,
  atk: 1,
  def: 0,
  spd: 1,
  exp: 0,
};

const player: PlayerCombat = {
  hp: 100,
  maxHp: 1_000,
  atk: 100,
  def: 0,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  critChancePct: 0,
  berserkerMadnessRank: 3,
  enduranceActive: true,
};

function lethalPoison() {
  return makePoisonDot({
    stacks: 1,
    pctMaxHpPerStack: 100,
    sourceAtk: 1_000,
  });
}

describe("광전사–패황 ATB 지속 피해", () => {
  it("첫 치명 DoT은 사망 극복하고 다음 치명 DoT은 일반 불굴로 넘긴다", () => {
    let state = initialBattleState(player, enemy, "광기의 왕좌");
    state = {
      ...state,
      playerV2Dots: [lethalPoison()],
    };

    state = tickPlayerDotsOnAction(state, player, "광기의 왕좌");
    expect(state.playerHp).toBe(400);
    expect(state.flags.enduranceTriggered).toBe(false);
    expect(state.berserker?.deathOvercomeUsed).toBe(true);
    expect(state.phase).not.toBe("ended");

    state = tickPlayerDotsOnAction(
      {
        ...state,
        playerHp: 100,
        playerV2Dots: [lethalPoison()],
      },
      player,
      "광기의 왕좌",
    );
    expect(state.playerHp).toBe(1);
    expect(state.flags.enduranceTriggered).toBe(true);
    expect(state.phase).not.toBe("ended");
  });
});
