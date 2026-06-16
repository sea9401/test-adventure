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
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";
import {
  actionInterval,
  effectiveMonsterSpd,
} from "@/adventure/v2/combat/combatTimeline";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

const basePlayer: PlayerCombat = {
  hp: 120,
  maxHp: 120,
  atk: 18,
  def: 6,
  spd: 30,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

const baseEnemy: Monster = {
  name: "ATB 허수아비",
  tags: [],
  hp: 100,
  atk: 8,
  def: 3,
  spd: 6,
  exp: 0,
  evasionPct: 0,
};

function run(
  player: PlayerCombat,
  enemy: Monster,
  seed = 1,
  maxTurns?: number,
): BattleResolution {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
  const result = resolveBattle(player, enemy, "테스터", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    ...(maxTurns === undefined ? {} : { maxTurns }),
  });
  vi.restoreAllMocks();
  return result;
}

function actionCounts(result: BattleResolution): { player: number; enemy: number } {
  const player = result.finalState.log.filter(
    (entry) => entry.kind === "player_attack" && entry.text.includes("공격!"),
  ).length;
  const enemy = result.finalState.log.filter(
    (entry) => entry.kind === "enemy_attack",
  ).length;
  return { player, enemy };
}

describe("resolveBattle ATB invariants", () => {
  it("deterministic: same inputs produce identical logs/outcome across seeded runs", () => {
    const runs = [run(basePlayer, baseEnemy, 123), run(basePlayer, baseEnemy, 123), run(basePlayer, baseEnemy, 123)];
    const fingerprints = runs.map((r) => ({
      outcome: r.outcome,
      playerHp: r.finalState.playerHp,
      enemyHp: r.finalState.enemyHp,
      log: r.finalState.log,
    }));
    expect(fingerprints[1]).toEqual(fingerprints[0]);
    expect(fingerprints[2]).toEqual(fingerprints[0]);
  });

  it("타임라인 틱 스탬프: 행동·hp_bar 엔트리에 t 가 찍히고 비감소(UI 윈도우 그룹화용)", () => {
    const result = run(basePlayer, baseEnemy, 123);
    const log = result.finalState.log;
    // 행동/hp_bar 엔트리는 t 를 가진다(오프닝 info 등 일부 t-less 는 허용).
    const stamped = log.filter(
      (e) =>
        e.kind === "player_attack" ||
        e.kind === "enemy_attack" ||
        e.kind === "hp_bar",
    );
    expect(stamped.length).toBeGreaterThan(0);
    expect(stamped.every((e) => typeof e.t === "number")).toBe(true);
    // 틱은 시간순(비감소).
    const ticks = stamped.map((e) => e.t as number);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]).toBeGreaterThanOrEqual(ticks[i - 1]);
    }
  });

  it("speed asymmetry: fast player gets more action bundles than slow enemy", () => {
    const player: PlayerCombat = {
      ...basePlayer,
      hp: 10_000,
      maxHp: 10_000,
      atk: 1,
      def: 0,
      spd: 100,
    };
    const enemy: Monster = {
      ...baseEnemy,
      hp: 10_000,
      atk: 1,
      def: 0,
      spd: 10,
    };
    const result = run(player, enemy, 7);
    const counts = actionCounts(result);
    const observed = counts.player / counts.enemy;
    const expected = actionInterval(effectiveMonsterSpd(enemy.spd)) / actionInterval(player.spd);
    expect(counts.player).toBeGreaterThan(counts.enemy);
    expect(observed).toBeGreaterThan(1.05);
    expect(observed).toBeCloseTo(expected, 0);
  });

  it("stalemate hits cap: nonlethal fixtures resolve as player loss", () => {
    const player: PlayerCombat = {
      ...basePlayer,
      hp: 1_000_000,
      maxHp: 1_000_000,
      atk: 1,
      def: 100,
      spd: 20,
    };
    const enemy: Monster = {
      ...baseEnemy,
      hp: 1_000_000,
      atk: 1,
      def: 100,
      spd: 6,
    };
    const result = run(player, enemy, 11);
    expect(result.outcome).toBe("lose");
    expect(result.finalState.outcome).toBe("lose");
  });

  it("normal outcome: standard fixtures resolve to win or loss", () => {
    const result = run(basePlayer, baseEnemy, 5);
    expect(["win", "lose"]).toContain(result.outcome);
    expect(result.finalState.outcome).toBe(result.outcome);
  });
});
