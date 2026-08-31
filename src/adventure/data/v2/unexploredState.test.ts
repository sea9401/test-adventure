import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_ACHIEVEMENT_IDS,
  canChangeUnexploredNodes,
  canUseUnexplored,
  emptyUnexploredSave,
  parseUnexploredSave,
  unexploredEarnedPoints,
} from "./unexploredState";

describe("unexplored save", () => {
  it("normalizes malformed input to an empty save", () => {
    expect(parseUnexploredSave(null)).toEqual(emptyUnexploredSave());
    expect(
      parseUnexploredSave({
        explorationXp: -3,
        xpPoints: Number.NaN,
        achievementIds: "all",
        selectedNodeIds: 12,
        traces: "many",
        craftReceipts: {},
      }),
    ).toEqual(emptyUnexploredSave());
  });

  it("keeps only known unique nodes and achievements", () => {
    const save = parseUnexploredSave({
      explorationXp: 12.9,
      xpPoints: 41.7,
      achievementIds: [
        "first_unexplored_hunt",
        "unknown",
        "first_unexplored_hunt",
      ],
      selectedNodeIds: ["start", "inner-0-0", "unknown", "start"],
    });

    expect(save.explorationXp).toBe(12);
    expect(save.xpPoints).toBe(30);
    expect(save.achievementIds).toEqual(["first_unexplored_hunt"]);
    expect(save.selectedNodeIds).toEqual(["start", "inner-0-0"]);
  });

  it("shows the first XP point at level 100 and caps earned points at 40", () => {
    const empty = emptyUnexploredSave();
    expect(unexploredEarnedPoints(99, empty)).toBe(0);
    expect(unexploredEarnedPoints(100, empty)).toBe(1);

    const completed = parseUnexploredSave({
      xpPoints: 99,
      achievementIds: [...UNEXPLORED_ACHIEVEMENT_IDS, "unknown"],
    });
    expect(unexploredEarnedPoints(100, completed)).toBe(40);
  });

  it("requires level 100 to edit nodes and also requires start to hunt", () => {
    const opened = parseUnexploredSave({ selectedNodeIds: ["start"] });
    expect(canChangeUnexploredNodes(99)).toBe(false);
    expect(canChangeUnexploredNodes(100)).toBe(true);
    expect(canUseUnexplored(99, opened)).toBe(false);
    expect(canUseUnexplored(100, emptyUnexploredSave())).toBe(false);
    expect(canUseUnexplored(100, opened)).toBe(true);
  });

  it("preserves progress while a reincarnated character is below level 100", () => {
    const parsed = parseUnexploredSave({
      explorationXp: 1234,
      xpPoints: 8,
      selectedNodeIds: ["start", "inner-0-0"],
      traces: { iron_legion: 321 },
    });

    expect(canUseUnexplored(42, parsed)).toBe(false);
    expect(parsed).toMatchObject({
      explorationXp: 1234,
      xpPoints: 8,
      selectedNodeIds: ["start", "inner-0-0"],
      traces: { iron_legion: 321 },
    });
  });

  it("keeps only the latest 50 valid craft receipts", () => {
    const receipts = Array.from({ length: 55 }, (_, index) => ({
      requestId: `request-${index}`,
      bossId: `boss-${index % 3}`,
      craftedAt: 1_000 + index,
    }));
    const parsed = parseUnexploredSave({
      craftReceipts: [
        { requestId: "", bossId: "boss", craftedAt: 1 },
        ...receipts,
        { requestId: "bad", bossId: "boss", craftedAt: Number.NaN },
      ],
    });

    expect(parsed.craftReceipts).toHaveLength(50);
    expect(parsed.craftReceipts[0]?.requestId).toBe("request-5");
    expect(parsed.craftReceipts[49]?.requestId).toBe("request-54");
  });
});
