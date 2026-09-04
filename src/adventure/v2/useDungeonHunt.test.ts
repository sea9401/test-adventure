import { describe, expect, it } from "vitest";
import { buildDungeonHuntIntent } from "./useDungeonHunt";

describe("dungeon hunt intent", () => {
  it("keeps the normal request contract byte-compatible", () => {
    expect(
      buildDungeonHuntIntent({
        floor: 42,
        outpostId: "capital",
        rareMapIid: "map-1",
      }),
    ).toEqual({
      floor: 42,
      outpostId: "capital",
      rareMap: "map-1",
    });
  });

  it("marks unexplored requests and never sends a rare map", () => {
    expect(
      buildDungeonHuntIntent({
        floor: 999,
        count: 5,
        outpostId: "capital",
        rareMapIid: "map-1",
        huntMode: "unexplored",
      }),
    ).toEqual({
      floor: 999,
      count: 5,
      outpostId: "capital",
      mode: "unexplored",
    });
  });
});
