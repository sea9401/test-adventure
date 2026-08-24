import { describe, expect, it } from "vitest";
import {
  RANCH_SLOT_DEFINITIONS,
  addRanchFeed,
  collectRanchProducts,
  emptyRanchState,
  parseRanchState,
  rebuildRanchSlot,
  settleRanch,
  unlockRanchSlot,
  type RanchState,
} from "./ranch";

const HOUR = 60 * 60 * 1000;

function unlockThrough(
  lastSlot: number,
  animalId: "chicken" | "cow" | "pig" = "chicken",
): RanchState {
  let ranch = emptyRanchState(1_000);
  for (let number = 2; number <= lastSlot; number += 1) {
    ranch = unlockRanchSlot(
      ranch,
      `slot-${number}` as Parameters<typeof unlockRanchSlot>[1],
      animalId,
      100,
      1_000,
    ).ranch;
  }
  return ranch;
}

describe("adventurer ranch", () => {
  it("starts with one chicken slot and exposes the approved ten-slot progression", () => {
    const ranch = emptyRanchState(1_000);

    expect(
      RANCH_SLOT_DEFINITIONS.map(({ requiredLevel, costReputation }) => [
        requiredLevel,
        costReputation,
      ]),
    ).toEqual([
      [1, 0],
      [10, 30],
      [20, 60],
      [35, 120],
      [50, 180],
      [60, 1_000],
      [70, 2_000],
      [80, 4_000],
      [90, 8_000],
      [100, 16_000],
    ]);
    expect(ranch.version).toBe(2);
    expect(ranch.slots["slot-1"]).toMatchObject({
      unlocked: true,
      animalId: "chicken",
      feed: 0,
    });
    expect(
      Object.values(ranch.slots).filter((slot) => slot.unlocked),
    ).toHaveLength(1);
  });

  it("settles chicken production only at exact cycle boundaries", () => {
    let ranch = emptyRanchState(1_000);
    ranch = addRanchFeed(ranch, "slot-1", 6, 1_000);

    expect(
      settleRanch(ranch, 1_000 + 2 * HOUR - 1).slots["slot-1"],
    ).toMatchObject({ feed: 6, readyItems: 0, readyCycles: 0 });
    expect(
      settleRanch(ranch, 1_000 + 12 * HOUR).slots["slot-1"],
    ).toMatchObject({
      feed: 0,
      progressMs: 0,
      readyItems: 12,
      readyCycles: 6,
    });
  });

  it("preserves partial progress and does not reuse idle time after feed depletion", () => {
    let ranch = addRanchFeed(emptyRanchState(1_000), "slot-1", 1, 1_000);
    ranch = settleRanch(ranch, 1_000 + HOUR);
    ranch = addRanchFeed(ranch, "slot-1", 5, 1_000 + HOUR);

    expect(
      settleRanch(ranch, 1_000 + 2 * HOUR).slots["slot-1"],
    ).toMatchObject({ feed: 5, progressMs: 0, readyItems: 2 });

    ranch = settleRanch(ranch, 1_000 + 20 * HOUR);
    ranch = addRanchFeed(ranch, "slot-1", 1, 1_000 + 20 * HOUR);
    expect(
      settleRanch(ranch, 1_000 + 22 * HOUR - 1).slots["slot-1"].readyItems,
    ).toBe(12);
    expect(
      settleRanch(ranch, 1_000 + 22 * HOUR).slots["slot-1"].readyItems,
    ).toBe(14);
  });

  it("unlocks slots in order and validates both slot and animal levels", () => {
    const ranch = emptyRanchState(1_000);

    expect(() =>
      unlockRanchSlot(ranch, "slot-3", "chicken", 100, 1_000),
    ).toThrow("slot_locked");
    expect(() =>
      unlockRanchSlot(ranch, "slot-2", "chicken", 9, 1_000),
    ).toThrow("level_required");
    expect(() =>
      unlockRanchSlot(ranch, "slot-2", "cow", 19, 1_000),
    ).toThrow("animal_level_required");

    const slot2 = unlockRanchSlot(ranch, "slot-2", "chicken", 10, 1_000);
    expect(slot2.costReputation).toBe(30);
    expect(slot2.ranch.slots["slot-2"]).toMatchObject({
      unlocked: true,
      animalId: "chicken",
    });
    expect(() =>
      unlockRanchSlot(slot2.ranch, "slot-2", "cow", 100, 1_000),
    ).toThrow("already_unlocked");
  });

  it("supports every slot cost and starts a newly constructed pigsty with one pig", () => {
    let ranch = emptyRanchState(1_000);
    const costs: number[] = [];

    for (let number = 2; number <= 10; number += 1) {
      const animalId = number === 10 ? "pig" : "chicken";
      const result = unlockRanchSlot(
        ranch,
        `slot-${number}` as Parameters<typeof unlockRanchSlot>[1],
        animalId,
        100,
        1_000,
      );
      costs.push(result.costReputation);
      ranch = result.ranch;
    }

    expect(costs).toEqual([30, 60, 120, 180, 1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(ranch.slots["slot-10"]).toMatchObject({
      unlocked: true,
      animalId: "pig",
      feed: 4,
      progressMs: 0,
      readyItems: 0,
    });
    expect(
      settleRanch(ranch, 1_000 + 16 * HOUR).slots["slot-10"],
    ).toMatchObject({ feed: 0, readyItems: 8, readyCycles: 1 });
  });

  it("settles and collects an arbitrary mix of animal buildings", () => {
    let ranch = unlockThrough(3);
    ranch = rebuildRanchSlot(ranch, "slot-2", "cow", 100, 1_000).ranch;
    ranch = rebuildRanchSlot(ranch, "slot-3", "pig", 100, 1_000).ranch;
    ranch = addRanchFeed(ranch, "slot-1", 3, 1_000);
    ranch = addRanchFeed(ranch, "slot-2", 2, 1_000);

    const collected = collectRanchProducts(ranch, 1_000 + 16 * HOUR);

    expect(collected.items).toEqual({ egg: 6, milk: 6, pork: 8 });
    expect(collected.farmingXp).toBe(34);
    expect(collected.cycles).toEqual({ chicken: 3, cow: 2, pig: 1 });
    expect(collected.ranch.slots["slot-1"]).toMatchObject({
      readyItems: 0,
      readyCycles: 0,
    });
  });

  it("allows rebuilding only an idle slot and charges by the target animal", () => {
    const ranch = unlockThrough(2);
    const rebuilt = rebuildRanchSlot(ranch, "slot-2", "cow", 20, 2_000);

    expect(rebuilt.costReputation).toBe(1_000);
    expect(rebuilt.ranch.slots["slot-2"]).toMatchObject({
      unlocked: true,
      animalId: "cow",
      feed: 0,
      lastSettledAt: 2_000,
      progressMs: 0,
      readyItems: 0,
      readyCycles: 0,
    });
    expect(() =>
      rebuildRanchSlot(rebuilt.ranch, "slot-2", "cow", 100, 2_000),
    ).toThrow("same_animal");
    expect(() =>
      rebuildRanchSlot(rebuilt.ranch, "slot-2", "pig", 49, 2_000),
    ).toThrow("animal_level_required");
  });

  it("rejects rebuilding fed, progressing, ready, and locked slots", () => {
    const base = unlockThrough(2);
    const fed = addRanchFeed(base, "slot-2", 1, 1_000);
    expect(() => rebuildRanchSlot(fed, "slot-2", "cow", 100, 1_000)).toThrow(
      "slot_not_empty",
    );

    const progressing = settleRanch(fed, 1_000 + HOUR);
    expect(() =>
      rebuildRanchSlot(progressing, "slot-2", "cow", 100, 1_000 + HOUR),
    ).toThrow("slot_not_empty");

    const ready = settleRanch(fed, 1_000 + 2 * HOUR);
    expect(() =>
      rebuildRanchSlot(ready, "slot-2", "cow", 100, 1_000 + 2 * HOUR),
    ).toThrow("slot_not_empty");
    expect(() =>
      rebuildRanchSlot(base, "slot-3", "cow", 100, 1_000),
    ).toThrow("slot_locked");
  });

  it("preserves all fixed-pen progress and statistics when migrating version 1", () => {
    const parsed = parseRanchState(
      {
        version: 1,
        pens: {
          "coop-1": { unlocked: true, feed: 5, lastSettledAt: 100, progressMs: 200, readyItems: 4, readyCycles: 2 },
          "coop-2": { unlocked: true, feed: 3, lastSettledAt: 200, progressMs: 300, readyItems: 2, readyCycles: 1 },
          "cowshed-1": { unlocked: true, feed: 2, lastSettledAt: 300, progressMs: 400, readyItems: 6, readyCycles: 2 },
          "cowshed-2": { unlocked: false, feed: 1, lastSettledAt: 400, progressMs: 500, readyItems: 3, readyCycles: 1 },
          "pigsty-1": { unlocked: true, feed: 4, lastSettledAt: 500, progressMs: 600, readyItems: 8, readyCycles: 1 },
        },
        stats: { chickenCycles: 7, cowCycles: 5, pigCycles: 3, eggsCollected: 12, milkCollected: 9, porkCollected: 8 },
      },
      1_000,
    );

    expect(parsed.version).toBe(2);
    expect(parsed.slots["slot-1"]).toMatchObject({ unlocked: true, animalId: "chicken", feed: 5, lastSettledAt: 100, progressMs: 200, readyItems: 4, readyCycles: 2 });
    expect(parsed.slots["slot-2"]).toMatchObject({ unlocked: true, animalId: "chicken", feed: 3, readyItems: 2 });
    expect(parsed.slots["slot-3"]).toMatchObject({ unlocked: true, animalId: "cow", feed: 2, readyItems: 6 });
    expect(parsed.slots["slot-4"]).toMatchObject({ unlocked: false, animalId: null, feed: 0, progressMs: 0, readyItems: 0, readyCycles: 0 });
    expect(parsed.slots["slot-5"]).toMatchObject({ unlocked: true, animalId: "pig", feed: 4, lastSettledAt: 500, progressMs: 600, readyItems: 8, readyCycles: 1 });
    expect(parsed.slots["slot-6"].unlocked).toBe(false);
    expect(parsed.stats).toEqual({ chickenCycles: 7, cowCycles: 5, pigCycles: 3, eggsCollected: 12, milkCollected: 9, porkCollected: 8 });
  });

  it("normalizes damaged version 2 saves without manufacturing products", () => {
    const parsed = parseRanchState(
      {
        version: 2,
        slots: {
          "slot-1": { unlocked: true, animalId: "chicken", feed: 999, lastSettledAt: Number.POSITIVE_INFINITY, progressMs: -20, readyItems: -4, readyCycles: -2 },
          "slot-2": { unlocked: true, animalId: "dragon", feed: 999, readyCycles: 999 },
        },
      },
      50_000,
    );

    expect(parsed.slots["slot-1"]).toMatchObject({ unlocked: true, animalId: "chicken", feed: 6, lastSettledAt: 50_000, progressMs: 0, readyItems: 0, readyCycles: 0 });
    expect(parsed.slots["slot-2"]).toMatchObject({ unlocked: false, animalId: null, feed: 0, readyItems: 0 });
  });
});
