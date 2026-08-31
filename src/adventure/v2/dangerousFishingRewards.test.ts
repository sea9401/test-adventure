import { describe, expect, it } from "vitest";
import { dangerousReturnFishingCoins } from "./dangerousFishingRewards";

describe("dangerous fishing return rewards", () => {
  it.each([
    [2_700, 5, 135],
    [2_700.99, 5, 135],
    [2_701, 2.5, 67],
    [2_700, 0, 0],
    [2_700, -3, 0],
    [2_700, 99, 135],
    [0, 5, 0],
    [-200, 5, 0],
  ])(
    "returns exact post-loss value reward for cargo %s at risk %s",
    (retainedCargoValue, risk, expected) => {
      expect(
        dangerousReturnFishingCoins(retainedCargoValue, risk),
      ).toBe(expected);
    },
  );

  it("returns 75 coins for the highest cargo value at maximum risk", () => {
    expect(dangerousReturnFishingCoins(1_500, 5)).toBe(75);
  });

  it("keeps huge and malformed inputs from producing an unsafe reward", () => {
    const huge = dangerousReturnFishingCoins(Number.MAX_VALUE, 5);

    expect(huge).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(huge)).toBe(true);
    expect(dangerousReturnFishingCoins(Number.NaN, 5)).toBe(0);
    expect(dangerousReturnFishingCoins(2_700, Number.NaN)).toBe(0);
  });

  it("pays zero when cargo is empty or its retained value is fully lost", () => {
    expect(dangerousReturnFishingCoins(0, 5)).toBe(0);
    expect(dangerousReturnFishingCoins(-1, 5)).toBe(0);
  });
});
