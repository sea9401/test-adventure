import { describe, expect, it } from "vitest";
import type { Emblem } from "@/adventure/data/v2/emblems";
import { sortEmblemInventory } from "./emblemInventory";

const owned: readonly Emblem[] = Object.freeze([
  { iid: "luk-5", kind: "luk", grade: 5 },
  { iid: "hp-1", kind: "hp", grade: 1 },
  { iid: "str-3", kind: "str", grade: 3 },
  { iid: "hp-3-first", kind: "hp", grade: 3 },
  { iid: "mp-2", kind: "mp", grade: 2 },
  { iid: "hp-3-second", kind: "hp", grade: 3 },
  { iid: "spi-4", kind: "spi", grade: 4 },
  { iid: "int-3", kind: "int", grade: 3 },
  { iid: "vit-3", kind: "vit", grade: 3 },
  { iid: "dex-3", kind: "dex", grade: 3 },
]);

describe("sortEmblemInventory", () => {
  it("groups all kinds in stat order with higher grades first and stable duplicate numbers", () => {
    const result = sortEmblemInventory(owned, "kind");
    expect(result.map(({ item }) => item.iid)).toEqual([
      "hp-3-first", "hp-3-second", "hp-1", "mp-2", "str-3",
      "dex-3", "vit-3", "int-3", "spi-4", "luk-5",
    ]);
    expect(result.map(({ number }) => number)).toEqual([4, 6, 2, 5, 3, 10, 9, 8, 7, 1]);
  });

  it("sorts by highest grade then kind without changing the owned order", () => {
    const result = sortEmblemInventory(owned, "grade");
    expect(result.map(({ item }) => item.iid)).toEqual([
      "luk-5", "spi-4", "hp-3-first", "hp-3-second", "str-3",
      "dex-3", "vit-3", "int-3", "mp-2", "hp-1",
    ]);
    expect(sortEmblemInventory(owned, "acquired").map(({ item }) => item.iid)).toEqual([
      "luk-5", "hp-1", "str-3", "hp-3-first", "mp-2",
      "hp-3-second", "spi-4", "int-3", "vit-3", "dex-3",
    ]);
  });

  it("handles an empty inventory", () => {
    expect(sortEmblemInventory([], "kind")).toEqual([]);
    expect(sortEmblemInventory([], "grade")).toEqual([]);
    expect(sortEmblemInventory([], "acquired")).toEqual([]);
  });
});
