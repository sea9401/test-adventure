import { describe, expect, it } from "vitest";
import { normalizedHuntLocationIds } from "./huntLocations";

describe("normalizedHuntLocationIds", () => {
  it("removes empty and duplicate locations and sorts lock order", () => {
    expect(normalizedHuntLocationIds("village", "alpha-tile")).toEqual([
      "alpha-tile",
      "village",
    ]);
    expect(normalizedHuntLocationIds("village", "village")).toEqual([
      "village",
    ]);
    expect(normalizedHuntLocationIds(null, null)).toEqual([]);
    expect(normalizedHuntLocationIds("", "tile-2")).toEqual(["tile-2"]);
  });
});
