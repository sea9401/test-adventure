import { describe, expect, it } from "vitest";
import {
  anonymousUnexploredRankLabel,
  classifyUnexploredBuild,
  groupUnexploredRates,
  rankUnexploredCandidates,
  summarizeUnexploredRates,
  type UnexploredRateRow,
} from "./unexploredSimulationAnalysis";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import type { V2SkillId, V2SkillsState } from "./v2Skills";

function combat(overrides: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 1_000,
    maxHp: 1_000,
    atk: 100,
    magicAtk: 100,
    def: 100,
    magicDef: 100,
    spd: 100,
    evasionPct: 0,
    evaRating: 50,
    attackCount: 1,
    ...overrides,
  };
}

function skills(...equipped: V2SkillId[]): V2SkillsState {
  return { learned: equipped, equipped };
}

function rateRow(
  playerIndex: number,
  wins: number,
  total: number,
  overrides: Partial<UnexploredRateRow> = {},
): UnexploredRateRow {
  return {
    playerIndex,
    difficulty: 90,
    mode: "mechanics",
    poolId: "iron_legion",
    job: "검성",
    buildLabel: "물리 우세 · 물리 방어 · 비상태",
    wins,
    total,
    ...overrides,
  };
}

describe("unexplored simulation analysis", () => {
  it("orders candidates by total proficiency, current level, then update time", () => {
    const ranked = rankUnexploredCandidates([
      {
        opaqueKey: "lower-mastery",
        totalCumLevel: 199,
        level: 100,
        updatedAtMs: 1,
      },
      {
        opaqueKey: "later-update",
        totalCumLevel: 200,
        level: 100,
        updatedAtMs: 20,
      },
      {
        opaqueKey: "lower-level",
        totalCumLevel: 200,
        level: 99,
        updatedAtMs: 1,
      },
      {
        opaqueKey: "earlier-update",
        totalCumLevel: 200,
        level: 100,
        updatedAtMs: 10,
      },
    ]);

    expect(ranked.map((candidate) => candidate.opaqueKey)).toEqual([
      "earlier-update",
      "later-update",
      "lower-level",
      "lower-mastery",
    ]);
  });

  it("limits the working set and formats only anonymous ordinal labels", () => {
    const candidates = Array.from({ length: 35 }, (_, index) => ({
      opaqueKey: `private-${index}`,
      totalCumLevel: 35 - index,
      level: 100,
      updatedAtMs: index,
    }));

    expect(rankUnexploredCandidates(candidates)).toHaveLength(30);
    expect(anonymousUnexploredRankLabel(0)).toBe("01위");
    expect(anonymousUnexploredRankLabel(29)).toBe("30위");
    expect(anonymousUnexploredRankLabel(0)).not.toContain("private");
  });

  it("classifies attack and defensive axes from actual combat stats", () => {
    expect(
      classifyUnexploredBuild(
        combat({ atk: 150, magicAtk: 100, def: 200, magicDef: 100 }),
        skills(),
      ),
    ).toMatchObject({ offense: "물리 우세", defense: "물리 방어" });
    expect(
      classifyUnexploredBuild(
        combat({ atk: 100, magicAtk: 150, def: 100, magicDef: 200 }),
        skills(),
      ),
    ).toMatchObject({ offense: "마법 우세", defense: "마법 방어" });
    expect(
      classifyUnexploredBuild(
        combat({ atk: 110, magicAtk: 100, evaRating: 150 }),
        skills(),
      ),
    ).toMatchObject({ offense: "혼합", defense: "회피" });
    expect(
      classifyUnexploredBuild(
        combat({ def: 110, magicDef: 100, evaRating: 50 }),
        skills(),
      ).defense,
    ).toBe("균형");
  });

  it("classifies status setups by equipped skill mechanics", () => {
    expect(
      classifyUnexploredBuild(combat(), skills("v2c_rogue_poison")).status,
    ).toBe("중독");
    expect(
      classifyUnexploredBuild(combat(), skills("v2c_beastkin_rend")).status,
    ).toBe("출혈");
    expect(
      classifyUnexploredBuild(combat(), skills("v2c_frostmage_glacier")).status,
    ).toBe("둔화");
    expect(
      classifyUnexploredBuild(
        combat(),
        skills("v2c_rogue_poison", "v2c_beastkin_rend"),
      ).status,
    ).toBe("복합 상태");
    expect(classifyUnexploredBuild(combat(), skills()).status).toBe("비상태");
  });

  it("summarizes weighted trials and player-level percentiles separately", () => {
    const summary = summarizeUnexploredRates([
      rateRow(0, 1, 1),
      rateRow(1, 1, 4),
      rateRow(2, 1, 2),
      rateRow(3, 0, 5),
    ]);

    expect(summary).toEqual({
      wins: 3,
      total: 12,
      ratePct: 25,
      samplePlayers: 4,
      minPct: 0,
      p25Pct: 0,
      medianPct: 25,
      p75Pct: 50,
      maxPct: 100,
      playersAtLeast20Pct: 3,
      playersAtLeast40Pct: 2,
      playersAtLeast70Pct: 1,
    });
  });

  it("handles empty, all-loss, and all-win inputs", () => {
    expect(summarizeUnexploredRates([])).toMatchObject({
      wins: 0,
      total: 0,
      ratePct: 0,
      samplePlayers: 0,
      minPct: 0,
      maxPct: 0,
    });
    expect(summarizeUnexploredRates([rateRow(0, 0, 3)])).toMatchObject({
      ratePct: 0,
      samplePlayers: 1,
      minPct: 0,
      maxPct: 0,
    });
    expect(summarizeUnexploredRates([rateRow(0, 3, 3)])).toMatchObject({
      ratePct: 100,
      samplePlayers: 1,
      minPct: 100,
      maxPct: 100,
      playersAtLeast70Pct: 1,
    });
  });

  it("groups rows without hiding one-player sample sizes", () => {
    const grouped = groupUnexploredRates(
      [
        rateRow(0, 3, 4, { job: "검성" }),
        rateRow(1, 1, 4, { job: "대마도사" }),
        rateRow(2, 2, 4, { job: "검성" }),
      ],
      (row) => row.job,
    );

    expect(grouped.map((group) => group.key)).toEqual(["검성", "대마도사"]);
    expect(grouped[0].summary).toMatchObject({
      wins: 5,
      total: 8,
      ratePct: 62.5,
      samplePlayers: 2,
    });
    expect(grouped[1].summary).toMatchObject({
      wins: 1,
      total: 4,
      ratePct: 25,
      samplePlayers: 1,
    });
  });
});
