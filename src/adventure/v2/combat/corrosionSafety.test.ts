import { describe, expect, it } from "vitest";

import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  applyPlayerOnHitDots,
  initialBattleState,
  playerFacingEnemyDef,
  type PlayerCombat,
} from "./engine";

const PLAYER: PlayerCombat = {
  hp: 1_000,
  maxHp: 1_000,
  mp: 100,
  maxMp: 100,
  atk: 100,
  def: 50,
  spd: 10,
  attackCount: 1,
  extraAttackChancePct: 0,
  critChancePct: 0,
  critMult: 1.4,
  evasionPct: 0,
  poisonedEnemyDefReductionPct: 140,
  poisonOnHit: { pctMaxHpPerStack: 0.01 },
};

describe("부식 손상 입력 안전장치", () => {
  it("완성 맹독 계보는 부식과 독립적으로 중독 피해를 2.22배 증폭한다", () => {
    const fullLinePlayer = {
      ...PLAYER,
      poisonedEnemyDefReductionPct: 39.79489504,
      poisonDamagePct: 122,
    };
    const state = initialBattleState(
      fullLinePlayer,
      V2_MONSTERS["훈련용 허수아비"],
      "독술사",
    );
    const next = applyPlayerOnHitDots(state, fullLinePlayer);
    const poison = next.enemyV2Dots.find((dot) => dot.tag === "poison");

    expect(poison?.pctMaxHpPerStack).toBeCloseTo(0.0222, 10);
  });

  it("100%를 넘는 옛 값도 최종 60% 상한에서 멈춘다", () => {
    const state = {
      ...initialBattleState(
        PLAYER,
        { ...V2_MONSTERS["훈련용 허수아비"], def: 1_000 },
        "독술사",
      ),
      enemyV2Dots: [
        {
          tag: "poison" as const,
          label: "중독",
          stacks: 1,
          maxStacks: 10,
          turns: 3,
          flatPerStack: 0,
          atkCoefPerStack: 0,
          pctMaxHpPerStack: 0.01,
          sourceAtk: 100,
        },
      ],
    };

    expect(playerFacingEnemyDef(state, PLAYER)).toBe(400);
  });

  it("손상된 부식 수치는 중독 피해를 증폭하지 않는다", () => {
    const state = initialBattleState(
      PLAYER,
      V2_MONSTERS["훈련용 허수아비"],
      "독술사",
    );
    const next = applyPlayerOnHitDots(state, PLAYER);
    const poison = next.enemyV2Dots.find((dot) => dot.tag === "poison");

    expect(poison?.pctMaxHpPerStack).toBeCloseTo(0.01, 10);
  });
});
