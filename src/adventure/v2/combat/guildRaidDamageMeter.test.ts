import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  advanceTurn,
  applyCounterIfAny,
  initialBattleState,
  resolveBattle,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";
import { makePoisonDot } from "@/adventure/v2/combat/combatShared";

afterEach(() => vi.restoreAllMocks());

describe("길드 토벌전 피해 계측", () => {
  it("보스 원형 HP를 소진해도 상태를 유지하고 다음 행동 피해까지 누적한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const player: PlayerCombat = {
      hp: 10_000,
      maxHp: 10_000,
      atk: 1_000,
      def: 100,
      spd: 500,
      evasionPct: 0,
      attackCount: 1,
      accuracyPct: 100,
    };
    const enemy: Monster = {
      name: "토벌 계측 허수아비",
      tags: [],
      hp: 100,
      atk: 1,
      def: 0,
      spd: 1,
      exp: 0,
      evasionPct: 0,
    };

    const result = resolveBattle(player, enemy, "공격자", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      maxTurns: 2,
      damageMeter: { continueAfterDefeat: true, refillHp: enemy.hp },
    });

    expect(result.damageDealtTotal).toBeGreaterThan(enemy.hp * 2);
    expect(
      result.finalState.log.filter((entry) => entry.kind === "player_attack"),
    ).toHaveLength(2);
    expect(
      result.finalState.log.some((entry) =>
        entry.text.includes("피해 계측 구간 돌파"),
      ),
    ).toBe(true);
  });

  it("계측 옵션이 없으면 기존처럼 첫 처치에서 전투를 끝낸다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const result = resolveBattle(
      {
        hp: 10_000,
        maxHp: 10_000,
        atk: 1_000,
        def: 100,
        spd: 500,
        evasionPct: 0,
        attackCount: 1,
        accuracyPct: 100,
      },
      {
        name: "일반 허수아비",
        tags: [],
        hp: 100,
        atk: 1,
        def: 0,
        spd: 1,
        exp: 0,
        evasionPct: 0,
      },
      "공격자",
      { pickAction: () => ({ kind: "attack" }), potions: {}, maxTurns: 2 },
    );

    expect(result.outcome).toBe("win");
    expect(result.damageDealtTotal).toBeUndefined();
    expect(
      result.finalState.log.filter((entry) => entry.kind === "player_attack"),
    ).toHaveLength(1);
  });

  it("회피 반격 피해도 별도 계측 합계에 포함한다", () => {
    const player: PlayerCombat = {
      hp: 1_000,
      maxHp: 1_000,
      atk: 100,
      def: 10,
      spd: 10,
      evasionPct: 0,
      attackCount: 1,
      accuracyPct: 100,
      counterAtkBonus: 100,
    };
    const state = {
      ...initialBattleState(
        player,
        {
          name: "반격 계측 허수아비",
          tags: [],
          hp: 10_000,
          atk: 1,
          def: 0,
          spd: 1,
          exp: 0,
          evasionPct: 0,
        },
        "공격자",
      ),
      enemyDamageDealtTotal: 0,
    };

    const result = applyCounterIfAny(state, player);

    expect(result.state.enemyDamageDealtTotal).toBeGreaterThan(0);
  });

  it("적에게 걸린 지속 피해도 별도 계측 합계에 포함한다", () => {
    const player: PlayerCombat = {
      hp: 1_000,
      maxHp: 1_000,
      atk: 100,
      def: 100,
      spd: 10,
      evasionPct: 0,
      attackCount: 1,
      accuracyPct: 100,
    };
    const initial = initialBattleState(
      player,
      {
        name: "지속 피해 계측 허수아비",
        tags: [],
        hp: 10_000,
        atk: 1,
        def: 0,
        spd: 1,
        exp: 0,
        evasionPct: 0,
      },
      "공격자",
    );
    const state = {
      ...initial,
      phase: "enemy" as const,
      enemyDamageDealtTotal: 0,
      enemyV2Dots: [
        makePoisonDot({
          stacks: 1,
          pctMaxHpPerStack: 0.005,
          sourceAtk: 1_000,
        }),
      ],
    };

    const result = advanceTurn(state, player, "공격자");

    expect(result.enemyDamageDealtTotal).toBeGreaterThan(0);
  });
});
