import { describe, expect, it } from "vitest";
import { affordableFullCharge } from "./v2-charge-config";

describe("affordableFullCharge", () => {
  it("uses all spendable gold when it is less than the remaining capacity", () => {
    expect(affordableFullCharge(400_000, 140_764)).toBe(140_764);
  });

  it("does not exceed the remaining capacity when gold is sufficient", () => {
    expect(affordableFullCharge(9_900_000, 500_000)).toBe(100_000);
  });

  it.each([
    [10_000_000, 50_000],
    [400_000, 0],
  ])("returns zero when no purchase is possible", (current, gold) => {
    expect(affordableFullCharge(current, gold)).toBe(0);
  });

  it("normalizes fractional, negative, and non-finite values", () => {
    expect(affordableFullCharge(9_999_998.9, 10.8)).toBe(2);
    expect(affordableFullCharge(-50, Number.NaN)).toBe(0);
    expect(affordableFullCharge(Number.POSITIVE_INFINITY, 100)).toBe(100);
    expect(affordableFullCharge(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
