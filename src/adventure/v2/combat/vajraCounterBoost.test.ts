import { afterEach, describe, expect, it, vi } from "vitest";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  applyPlayerV2SkillCast,
  applyPassiveCounterOnHitIfAny,
  initialBattleState,
} from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import type { PlayerCombat } from "./engineState";

const player: PlayerCombat = {
  hp: 400,
  maxHp: 400,
  atk: 100,
  def: 20,
  spd: 40,
  evasionPct: 0,
  attackCount: 1,
  passiveCounterChancePct: 100,
  passiveCounterDamageUsesReflectBoost: true,
};

afterEach(() => vi.restoreAllMocks());

describe("금강인 × 나한금신 반격 연계 — PvE", () => {
  it("금강인의 생존 효과는 첫 피격의 나한금신 반격을 막지 않는다", () => {
    const actor: PlayerCombat = {
      ...player,
      hp: 200,
      mp: 200,
      maxMp: 200,
    };
    const initial = initialBattleState(
      actor,
      V2_MONSTERS["훈련용 허수아비"],
      "금강나한",
      {
        learned: ["v2c_vajraarhat_seal"],
        equipped: ["v2c_vajraarhat_seal"],
      },
    );
    vi.spyOn(Math, "random").mockReturnValue(0);

    const cast = applyPlayerV2SkillCast(initial, actor, {
      selfBuffs: {},
      selfDebuffs: {},
      enemyDebuffs: {},
    });
    const afterHit = resolveEnemyPhase(cast.state, actor, "금강나한", true);

    expect(cast.castFired).toBe(true);
    expect(cast.state.stacks.playerShield).toBe(0);
    expect(cast.state.stacks.skillRegenPct).toBe(6);
    expect(cast.state.stacks.skillRegenTurns).toBe(3);
    expect(
      afterHit.log.some((entry) => entry.text.includes("[반격 + 금강인]")),
    ).toBe(true);
  });

  it("금강인이 활성화되면 나한금신 반격 피해가 45% 증가한다", () => {
    const state = initialBattleState(
      player,
      V2_MONSTERS["훈련용 허수아비"],
      "금강나한",
    );
    const active = {
      ...state,
      stacks: {
        ...state.stacks,
        skillReflectBoostPct: 45,
        skillReflectBoostTurns: 3,
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const normal = applyPassiveCounterOnHitIfAny(state, player);
    const boosted = applyPassiveCounterOnHitIfAny(active, player);
    const normalDamage = state.enemyHp - normal.enemyHp;
    const boostedDamage = active.enemyHp - boosted.enemyHp;

    expect(boostedDamage).toBeGreaterThan(normalDamage);
    expect(
      boosted.log.some((entry) => entry.text.includes("[반격 + 금강인]")),
    ).toBe(true);
  });

  it("금강인이 만료되면 반격 피해가 원래 값으로 돌아온다", () => {
    const state = initialBattleState(
      player,
      V2_MONSTERS["훈련용 허수아비"],
      "금강나한",
    );
    const expired = {
      ...state,
      stacks: {
        ...state.stacks,
        skillReflectBoostPct: 45,
        skillReflectBoostTurns: 0,
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const normal = applyPassiveCounterOnHitIfAny(state, player);
    const afterExpiry = applyPassiveCounterOnHitIfAny(expired, player);

    expect(afterExpiry.enemyHp).toBe(normal.enemyHp);
  });
});
