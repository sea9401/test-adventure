import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type PlayerCombat,
} from "./engine";
import { resolveBattlePvP } from "./engine-pvp";

afterEach(() => vi.restoreAllMocks());

function fighter(overrides: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 10_000,
    maxHp: 10_000,
    atk: 1,
    def: 100,
    spd: 30,
    evasionPct: 0,
    accuracyPct: 100,
    attackCount: 1,
    ...overrides,
  };
}

const shockSignature = {
  trigger: "on_hit" as const,
  label: "시험 감전",
  shockChancePct: 100,
};

describe("레거시 전투 감전 행동 스킵", () => {
  it("PvE에서도 한 번 건너뛴 다음 행동은 정상 수행한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemy: Monster = {
      name: "감전 허수아비",
      tags: [],
      hp: 100_000,
      atk: 1,
      def: 100,
      spd: 30,
      exp: 0,
      evasionPct: 0,
      accuracy: 100,
    };
    const res = resolveBattle(
      fighter({ equipSignatures: [shockSignature] }),
      enemy,
      "P1",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        maxTurns: 10,
      },
    );

    const skips = res.finalState.log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.text.includes("[감전] 감전 허수아비이(가) 움직이지 못했다."));
    expect(skips.length).toBeGreaterThanOrEqual(2);
    expect(
      res.finalState.log
        .slice(skips[0].index + 1, skips[1].index)
        .some((entry) => entry.kind === "enemy_attack"),
    ).toBe(true);
  });

  it("PvP에서도 대상별 면역 행동을 거친 뒤에만 다시 감전된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const res = resolveBattlePvP(
      fighter({ equipSignatures: [shockSignature] }),
      fighter(),
      "P1",
      "P2",
      {
        pickAction: () => ({ kind: "attack" }),
        potions: { p1: {}, p2: {} },
        initiativeRoll: 0,
      },
    );

    const skips = res.finalState.log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.text.includes("[감전] P2이(가) 움직이지 못했다."));
    expect(skips.length).toBeGreaterThanOrEqual(2);
    expect(
      res.finalState.log
        .slice(skips[0].index + 1, skips[1].index)
        .some((entry) => entry.kind === "player_attack" && entry.side === "p2"),
    ).toBe(true);
  });
});
