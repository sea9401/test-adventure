import { describe, expect, it } from "vitest";
import {
  addRanchFeed,
  collectRanchProducts,
  emptyRanchState,
  parseRanchState,
  settleRanch,
  unlockRanchPen,
} from "./ranch";

const HOUR = 60 * 60 * 1000;

describe("adventurer ranch", () => {
  it("settles chicken production only at exact cycle boundaries", () => {
    let ranch = emptyRanchState(1_000);
    ranch = addRanchFeed(ranch, "coop-1", 6, 1_000);

    expect(
      settleRanch(ranch, 1_000 + 2 * HOUR - 1).pens["coop-1"],
    ).toMatchObject({ feed: 6, readyItems: 0, readyCycles: 0 });

    expect(settleRanch(ranch, 1_000 + 12 * HOUR).pens["coop-1"]).toMatchObject({
      feed: 0,
      progressMs: 0,
      readyItems: 12,
      readyCycles: 6,
    });
  });

  it("preserves partial progress when feed is added", () => {
    let ranch = addRanchFeed(emptyRanchState(1_000), "coop-1", 1, 1_000);
    ranch = settleRanch(ranch, 1_000 + HOUR);
    ranch = addRanchFeed(ranch, "coop-1", 5, 1_000 + HOUR);

    expect(settleRanch(ranch, 1_000 + 2 * HOUR).pens["coop-1"]).toMatchObject({
      feed: 5,
      progressMs: 0,
      readyItems: 2,
      readyCycles: 1,
    });
  });

  it("does not turn idle time after depletion into production after refill", () => {
    let ranch = addRanchFeed(emptyRanchState(1_000), "coop-1", 1, 1_000);
    ranch = settleRanch(ranch, 1_000 + 20 * HOUR);
    ranch = addRanchFeed(ranch, "coop-1", 1, 1_000 + 20 * HOUR);

    expect(
      settleRanch(ranch, 1_000 + 22 * HOUR - 1).pens["coop-1"].readyItems,
    ).toBe(2);
    expect(
      settleRanch(ranch, 1_000 + 22 * HOUR).pens["coop-1"].readyItems,
    ).toBe(4);
  });

  it("enforces each pen feed capacity without partial acceptance", () => {
    const ranch = emptyRanchState(1_000);

    expect(() => addRanchFeed(ranch, "coop-1", 7, 1_000)).toThrow(
      "feed_capacity",
    );
    expect(() => addRanchFeed(ranch, "cowshed-1", 1, 1_000)).toThrow(
      "pen_locked",
    );
  });

  it("collects all ready products and farming xp once", () => {
    const ranch = addRanchFeed(emptyRanchState(1_000), "coop-1", 6, 1_000);
    const collected = collectRanchProducts(ranch, 1_000 + 12 * HOUR);

    expect(collected.items).toEqual({ egg: 12 });
    expect(collected.farmingXp).toBe(12);
    expect(collected.cycles).toEqual({ chicken: 6, cow: 0 });
    expect(collected.ranch.pens["coop-1"]).toMatchObject({
      readyItems: 0,
      readyCycles: 0,
    });
    expect(() =>
      collectRanchProducts(collected.ranch, 1_000 + 12 * HOUR),
    ).toThrow("nothing_to_collect");
  });

  it("requires the configured farming level and rejects duplicate pen unlocks", () => {
    const ranch = emptyRanchState(1_000);

    expect(() => unlockRanchPen(ranch, "coop-2", 9, 1_000)).toThrow(
      "level_required",
    );
    const unlocked = unlockRanchPen(ranch, "coop-2", 10, 1_000);
    expect(unlocked.costReputation).toBe(30);
    expect(unlocked.ranch.pens["coop-2"].unlocked).toBe(true);
    expect(() => unlockRanchPen(unlocked.ranch, "coop-2", 10, 1_000)).toThrow(
      "already_unlocked",
    );
  });

  it("normalizes damaged ranch saves without manufacturing products", () => {
    const parsed = parseRanchState(
      {
        pens: {
          "coop-1": {
            unlocked: true,
            feed: 999,
            lastSettledAt: Number.POSITIVE_INFINITY,
            progressMs: -20,
            readyItems: -4,
            readyCycles: -2,
          },
        },
      },
      50_000,
    );

    expect(parsed.pens["coop-1"]).toMatchObject({
      unlocked: true,
      feed: 6,
      lastSettledAt: 50_000,
      progressMs: 0,
      readyItems: 0,
      readyCycles: 0,
    });
    expect(parsed.pens["coop-2"].unlocked).toBe(false);
  });
});
