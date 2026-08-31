import { describe, expect, it } from "vitest";
import {
  forgeCombinationTotal,
  maxForgeCombinationQuantity,
  parseForgeCombinationQuantity,
} from "./forgeCombination";

describe("forge combination quantity rules", () => {
  it("defaults omitted quantities to one and accepts positive safe integers", () => {
    expect(parseForgeCombinationQuantity(undefined)).toBe(1);
    expect(parseForgeCombinationQuantity(3)).toBe(3);
    expect(parseForgeCombinationQuantity(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, "2", null])(
    "rejects invalid quantity %j",
    (quantity) => {
      expect(parseForgeCombinationQuantity(quantity)).toBeNull();
    },
  );

  it("multiplies safe batch totals and rejects overflow", () => {
    expect(forgeCombinationTotal(300_000, 3)).toBe(900_000);
    expect(
      forgeCombinationTotal(Number.MAX_SAFE_INTEGER, 2),
    ).toBeNull();
  });

  it("limits the maximum by materials, gold, and optional capacity", () => {
    expect(
      maxForgeCombinationQuantity({
        materialHave: 40,
        materialCost: 8,
        spendableGold: 900_000,
        goldCost: 300_000,
      }),
    ).toBe(3);
    expect(
      maxForgeCombinationQuantity({
        materialHave: 40,
        materialCost: 8,
        spendableGold: 9_000_000,
        goldCost: 300_000,
        capacity: 2,
      }),
    ).toBe(2);
  });

  it("returns zero when no batch is affordable or inputs are invalid", () => {
    expect(
      maxForgeCombinationQuantity({
        materialHave: 7,
        materialCost: 8,
        spendableGold: 900_000,
        goldCost: 300_000,
      }),
    ).toBe(0);
    expect(
      maxForgeCombinationQuantity({
        materialHave: 40,
        materialCost: 0,
        spendableGold: 900_000,
        goldCost: 300_000,
      }),
    ).toBe(0);
  });
});
