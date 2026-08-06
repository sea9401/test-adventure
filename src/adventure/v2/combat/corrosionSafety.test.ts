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
  it("완성 부식 계보는 중독 피해를 약 2.02배로 증폭한다", () => {
    const fullLinePlayer = {
      ...PLAYER,
      poisonedEnemyDefReductionPct: 67.87,
    };
    const state = initialBattleState(
      fullLinePlayer,
      V2_MONSTERS["훈련용 허수아비"],
      "독술사",
    );
    const next = applyPlayerOnHitDots(state, fullLinePlayer);
    const poison = next.enemyV2Dots.find((dot) => dot.tag === "poison");

    expect(poison?.pctMaxHpPerStack).toBeCloseTo(0.0201805);
  });

  it("100%를 넘는 옛 값도 적 방어력을 음수로 만들지 않는다", () => {
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

    expect(playerFacingEnemyDef(state, PLAYER)).toBe(0);
  });

  it("손상된 140% 값의 중독 증폭도 100% 부식 상한에서 멈춘다", () => {
    const state = initialBattleState(
      PLAYER,
      V2_MONSTERS["훈련용 허수아비"],
      "독술사",
    );
    const next = applyPlayerOnHitDots(state, PLAYER);
    const poison = next.enemyV2Dots.find((dot) => dot.tag === "poison");

    // 부식 100%의 중독 배율 = 1 + 100×1.5/100 = 2.5배.
    expect(poison?.pctMaxHpPerStack).toBeCloseTo(0.025);
  });
});
