import { describe, expect, it } from "vitest";
import {
  applyCodexMasteryMutation,
  displayCodexMasteryScore,
  emptyCodexMasteryProgress,
  validateCodexMasteryDefinition,
} from "./codexMastery";
import type { CodexMasteryEntryDefinition } from "./codexMasteryTypes";

const FISH: CodexMasteryEntryDefinition = {
  category: "fish",
  entryId: "fish:test-carp",
  label: "시험 잉어",
  thresholds: {
    bronze: 5,
    silver: 30,
    gold: 150,
    platinum: 500,
    diamond: 1_500,
    legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: {
    giant: { pointUnits: 2 },
    nearMax: { pointUnits: 4 },
  },
};

describe("codex mastery transition", () => {
  it("catches up through gold and awards every stage once", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const result = applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 150, sealIds: ["giant", "giant"] },
      now,
    );

    expect(result.next).toMatchObject({
      count: 150,
      currentTier: "gold",
      sealIds: ["giant"],
      scoreMilli: 9_000,
    });
    expect(result.newStages).toEqual([
      "discovered",
      "bronze",
      "silver",
      "gold",
    ]);
    expect(result.scoreDeltaMilli).toBe(9_000);
  });

  it("never lowers count, best value, tier, score, seals, or achieved timestamps", () => {
    const first = applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 500, bestValue: 75, sealIds: ["giant"] },
      new Date("2026-08-20T00:00:00.000Z"),
    ).next;
    const second = applyCodexMasteryMutation(
      FISH,
      first,
      { amount: 0, bestValue: 70, sealIds: ["giant"] },
      new Date("2026-08-21T00:00:00.000Z"),
    );

    expect(second.next).toEqual(first);
    expect(second.scoreDeltaMilli).toBe(0);
  });

  it("uses the persisted tier rather than optional timestamps for backfill idempotency", () => {
    // Break caught: a supported backfill row without timestamp metadata is scored a second time.
    const backfilled = {
      ...emptyCodexMasteryProgress("fish", FISH.entryId),
      count: 30,
      currentTier: "silver" as const,
      scoreMilli: 4_000,
      tierAchievedAt: {},
    };

    const result = applyCodexMasteryMutation(
      FISH,
      backfilled,
      { amount: 0 },
      new Date("2026-08-20T00:00:00.000Z"),
    );

    expect(result).toEqual({
      next: backfilled,
      newStages: [],
      newSealIds: [],
      scoreDeltaMilli: 0,
    });
  });

  it("rejects decreasing thresholds, unknown seals, and negative or non-finite input", () => {
    expect(validateCodexMasteryDefinition({
      ...FISH,
      thresholds: { ...FISH.thresholds, silver: 4 },
    })).toContain("thresholds must increase");
    expect(() => validateCodexMasteryDefinition({
      ...FISH,
      thresholds: null as never,
    })).not.toThrow();
    expect(validateCodexMasteryDefinition({
      ...FISH,
      thresholds: null as never,
    })).toBe("thresholds must be an object");
    expect(() => applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: -1 },
      new Date(),
    )).toThrow("amount");
    expect(() => applyCodexMasteryMutation(
      FISH,
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 1, sealIds: ["missing"] },
      new Date(),
    )).toThrow("unknown seal");
    for (const sealId of ["constructor", "toString"]) {
      expect(() => applyCodexMasteryMutation(
        FISH,
        emptyCodexMasteryProgress("fish", FISH.entryId),
        { amount: 1, sealIds: [sealId] },
        new Date(),
      )).toThrow("unknown seal");
    }
    const inheritedSeals = Object.create({ inherited: { pointUnits: 2 } }) as CodexMasteryEntryDefinition["seals"];
    expect(() => applyCodexMasteryMutation(
      { ...FISH, seals: inheritedSeals },
      emptyCodexMasteryProgress("fish", FISH.entryId),
      { amount: 1, sealIds: ["inherited"] },
      new Date(),
    )).toThrow("unknown seal");
  });

  it("accepts only unique lower historical score weights", () => {
    expect(validateCodexMasteryDefinition({
      ...FISH,
      compatibleScoreWeightsMilli: [900],
    })).toBeNull();
    expect(validateCodexMasteryDefinition({
      ...FISH,
      compatibleScoreWeightsMilli: [0],
    })).toContain("positive safe integers");
    expect(validateCodexMasteryDefinition({
      ...FISH,
      compatibleScoreWeightsMilli: [1_000],
    })).toContain("lower than scoreWeightMilli");
    expect(validateCodexMasteryDefinition({
      ...FISH,
      compatibleScoreWeightsMilli: [900, 900],
    })).toContain("unique");
  });

  it("rounds milli-points only for display", () => {
    expect(displayCodexMasteryScore(10_499)).toBe(10);
    expect(displayCodexMasteryScore(10_500)).toBe(11);
  });
});
