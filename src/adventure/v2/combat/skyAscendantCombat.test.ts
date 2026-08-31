import { describe, expect, it } from "vitest";
import { resolveCrossover } from "./skyAscendantCombat";

describe("비천무신 교차", () => {
  it("turns ranged to martial into pursuit and martial to ranged into capture", () => {
    expect(
      resolveCrossover({
        state: { lastFamily: "ranged" },
        currentFamily: "martial",
        hit: true,
        pvp: false,
      }),
    ).toEqual({
      state: { lastFamily: "martial" },
      bonus: "pursuit",
      damagePct: 40,
      accuracyBonusPct: 0,
      penetrationPct: 0,
      enemyDelayPct: 20,
      hastePct: 15,
    });
    expect(
      resolveCrossover({
        state: { lastFamily: "martial" },
        currentFamily: "ranged",
        hit: true,
        pvp: false,
      }),
    ).toMatchObject({
      state: { lastFamily: "ranged" },
      bonus: "capture",
      damagePct: 20,
      accuracyBonusPct: 25,
      penetrationPct: 45,
      hastePct: 15,
    });
  });

  it("updates family on a miss without granting damage or haste", () => {
    expect(
      resolveCrossover({
        state: { lastFamily: "ranged" },
        currentFamily: "martial",
        hit: false,
        pvp: false,
      }),
    ).toEqual({
      state: { lastFamily: "martial" },
      bonus: "none",
      damagePct: 0,
      accuracyBonusPct: 0,
      penetrationPct: 0,
      enemyDelayPct: 0,
      hastePct: 0,
    });
  });

  it("keeps state for unrelated skills and gives no bonus for the same family", () => {
    expect(
      resolveCrossover({
        state: { lastFamily: "ranged" },
        hit: true,
        pvp: false,
      }).state,
    ).toEqual({ lastFamily: "ranged" });
    expect(
      resolveCrossover({
        state: { lastFamily: "ranged" },
        currentFamily: "ranged",
        hit: true,
        pvp: false,
      }),
    ).toMatchObject({ bonus: "none", state: { lastFamily: "ranged" } });
  });

  it("uses the approved PvP caps", () => {
    expect(
      resolveCrossover({
        state: { lastFamily: "martial" },
        currentFamily: "ranged",
        hit: true,
        pvp: true,
      }),
    ).toMatchObject({
      bonus: "capture",
      damagePct: 12,
      accuracyBonusPct: 25,
      penetrationPct: 10,
      hastePct: 10,
    });
    expect(
      resolveCrossover({
        state: { lastFamily: "ranged" },
        currentFamily: "martial",
        hit: true,
        pvp: true,
      }),
    ).toMatchObject({
      bonus: "pursuit",
      damagePct: 25,
      enemyDelayPct: 10,
      hastePct: 10,
    });
  });
});
