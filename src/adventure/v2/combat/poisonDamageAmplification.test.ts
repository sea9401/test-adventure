import { describe, expect, it } from "vitest";

import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  applyPlayerOnHitDots,
  initialBattleState,
  type PlayerCombat,
} from "./engine";
import { applyPvPOnHitDots, initialBattleStatePvP } from "./engine-pvp";
import { tickV2Dots, v2DotPerStackDamage } from "./combatShared";

const BASE_PLAYER: PlayerCombat = {
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
  bleedOnHit: { flatPerStack: 10, atkCoefPerStack: 0 },
  poisonOnHit: { pctMaxHpPerStack: 0.01 },
};

function pveDots(poisonDamagePct: number) {
  const player = { ...BASE_PLAYER, poisonDamagePct };
  const state = initialBattleState(
    player,
    V2_MONSTERS["훈련용 허수아비"],
    "독술사",
  );
  return applyPlayerOnHitDots(state, player).enemyV2Dots;
}

function pvpDots(poisonDamagePct: number) {
  const attacker = { ...BASE_PLAYER, poisonDamagePct, spd: 20 };
  const state = initialBattleStatePvP(
    attacker,
    BASE_PLAYER,
    "공격자",
    "방어자",
  );
  return applyPvPOnHitDots(state.p2, state.p1).v2Dots;
}

describe("맹독 중독 피해 증폭", () => {
  it.each([
    ["PvE", pveDots],
    ["PvP", pvpDots],
  ] as const)("%s에서 중독만 증폭하고 출혈은 바꾸지 않는다", (_label, run) => {
    const base = run(0);
    const doubled = run(100);
    const basePoison = base.find((dot) => dot.tag === "poison");
    const doubledPoison = doubled.find((dot) => dot.tag === "poison");
    const baseBleed = base.find((dot) => dot.tag === "bleed");
    const doubledBleed = doubled.find((dot) => dot.tag === "bleed");

    expect(v2DotPerStackDamage(basePoison!, 1_000)).toBe(10);
    expect(v2DotPerStackDamage(doubledPoison!, 1_000)).toBe(20);
    expect(v2DotPerStackDamage(doubledBleed!, 1_000)).toBe(
      v2DotPerStackDamage(baseBleed!, 1_000),
    );
  });

  it.each([
    ["PvE", pveDots],
    ["PvP", pvpDots],
  ] as const)(
    "%s에서 고체력 대상 중독은 완성 세팅의 현재 상한 피해를 유지하며 2.224배 차이가 난다",
    (_label, run) => {
      const plain = tickV2Dots(run(0), 100_000).ticks.find(
        (tick) => tick.tag === "poison",
      );
      const fullBuild = tickV2Dots(run(122.4), 100_000).ticks.find(
        (tick) => tick.tag === "poison",
      );

      // 기존 완성 세팅 상한은 ATK 100 × 0.9 = 90. 새 기본값은 90 / 2.224 → floor 40.
      expect(plain?.damage).toBe(40);
      expect(fullBuild?.damage).toBe(90);
    },
  );
});
