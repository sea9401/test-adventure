import { afterEach, describe, expect, it, vi } from "vitest";

import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { initialBattleState, type PlayerCombat } from "./engine";
import { resolveEnemyPhase } from "./engine.enemyPhase";

const PLAYER: PlayerCombat = {
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

const ENEMY = V2_MONSTERS["훈련용 허수아비"];

afterEach(() => vi.restoreAllMocks());

describe("금강인 × 나한금신 반격 연계 — 일반 PvE 기본 공격", () => {
  it("금강인이 활성화되면 자동 반격 피해와 로그 라벨을 강화한다", () => {
    const initial = initialBattleState(PLAYER, ENEMY, "금강나한");
    const active = {
      ...initial,
      stacks: {
        ...initial.stacks,
        skillReflectBoostPct: 45,
        skillReflectBoostTurns: 3,
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const normal = resolveEnemyPhase(initial, PLAYER, "금강나한", true);
    const boosted = resolveEnemyPhase(active, PLAYER, "금강나한", true);
    const normalDamage = initial.enemyHp - normal.enemyHp;
    const boostedDamage = active.enemyHp - boosted.enemyHp;

    expect(boostedDamage).toBeGreaterThan(normalDamage);
    expect(
      boosted.log.some((entry) =>
        entry.text.includes("[반격 + 금강인]"),
      ),
    ).toBe(true);
  });

  it("금강인이 비활성 또는 만료되면 원래 반격 피해와 라벨을 유지한다", () => {
    const initial = initialBattleState(PLAYER, ENEMY, "금강나한");
    const inactive = {
      ...initial,
      stacks: {
        ...initial.stacks,
        skillReflectBoostPct: 0,
        skillReflectBoostTurns: 3,
      },
    };
    const expired = {
      ...initial,
      stacks: {
        ...initial.stacks,
        skillReflectBoostPct: 45,
        skillReflectBoostTurns: 0,
      },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const normal = resolveEnemyPhase(initial, PLAYER, "금강나한", true);
    const afterInactive = resolveEnemyPhase(
      inactive,
      PLAYER,
      "금강나한",
      true,
    );
    const afterExpiry = resolveEnemyPhase(expired, PLAYER, "금강나한", true);

    expect(afterInactive.enemyHp).toBe(normal.enemyHp);
    expect(afterExpiry.enemyHp).toBe(normal.enemyHp);
    for (const result of [afterInactive, afterExpiry]) {
      expect(
        result.log.some((entry) => entry.text.startsWith("[반격] ")),
      ).toBe(true);
      expect(
        result.log.some((entry) =>
          entry.text.includes("[반격 + 금강인]"),
        ),
      ).toBe(false);
    }
  });
});
