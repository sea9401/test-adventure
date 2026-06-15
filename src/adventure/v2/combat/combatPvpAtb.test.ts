import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import { resolveBattlePvP, type PvPBattleResolution } from "./engine-pvp";
import type { PlayerCombat } from "./engine";
import { actionInterval } from "./combatTimeline";

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
  hp: 300,
  maxHp: 300,
  atk: 24,
  def: 8,
  spd: 60,
  evasionPct: 0,
  attackCount: 1,
  accuracyPct: 100,
};

function run(
  p1: PlayerCombat,
  p2: PlayerCombat,
  seed = 1,
): PvPBattleResolution {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
  const result = resolveBattlePvP(p1, p2, "P1", "P2", {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
  });
  vi.restoreAllMocks();
  return result;
}

function actionCounts(result: PvPBattleResolution): { p1: number; p2: number } {
  return {
    p1: result.finalState.log.filter(
      (entry) =>
        entry.kind === "player_attack" &&
        entry.side === "p1" &&
        entry.text.includes("공격!"),
    ).length,
    p2: result.finalState.log.filter(
      (entry) =>
        entry.kind === "player_attack" &&
        entry.side === "p2" &&
        entry.text.includes("공격!"),
    ).length,
  };
}

describe("resolveBattlePvP ATB invariants", () => {
  it("deterministic: same seeded inputs produce identical outcome and log", () => {
    const runs = [
      run(basePlayer, { ...basePlayer, spd: 45 }, 123),
      run(basePlayer, { ...basePlayer, spd: 45 }, 123),
    ];
    expect({
      outcome: runs[1].outcome,
      p1Hp: runs[1].finalState.p1.hp,
      p2Hp: runs[1].finalState.p2.hp,
      log: runs[1].finalState.log,
    }).toEqual({
      outcome: runs[0].outcome,
      p1Hp: runs[0].finalState.p1.hp,
      p2Hp: runs[0].finalState.p2.hp,
      log: runs[0].finalState.log,
    });
  });

  it("speed asymmetry: fast side gets about twice as many action bundles", () => {
    const fast: PlayerCombat = {
      ...basePlayer,
      hp: 50_000,
      maxHp: 50_000,
      atk: 1,
      def: 0,
      spd: 292,
    };
    const slow: PlayerCombat = {
      ...basePlayer,
      hp: 50_000,
      maxHp: 50_000,
      atk: 1,
      def: 0,
      spd: 14,
    };
    const result = run(fast, slow, 7);
    const counts = actionCounts(result);
    const observed = counts.p1 / counts.p2;
    const expected = actionInterval(slow.spd) / actionInterval(fast.spd);
    expect(counts.p1).toBeGreaterThan(counts.p2);
    expect(observed).toBeGreaterThan(1.7);
    expect(observed).toBeCloseTo(expected, 0);
  });

  it("stalemate hits the tick cap and resolves by HP ratio", () => {
    const p1: PlayerCombat = {
      ...basePlayer,
      hp: 900,
      maxHp: 1_000,
      atk: 1,
      def: 100,
      spd: 30,
    };
    const p2: PlayerCombat = {
      ...basePlayer,
      hp: 400,
      maxHp: 500,
      atk: 1,
      def: 100,
      spd: 30,
    };
    const result = run(p1, p2, 11);
    expect(result.outcome).toBe("p1_win");
    expect(result.finalState.phase).toBe("ended");
    expect(result.finalState.log.some((entry) => entry.text.includes("틱 경과"))).toBe(true);
  });

  it("outcome is one of the PvP outcomes", () => {
    const result = run(basePlayer, { ...basePlayer, spd: 80 }, 5);
    expect(["p1_win", "p2_win", "draw"]).toContain(result.outcome);
    expect(result.finalState.outcome).toBe(result.outcome);
  });
});
