import { describe, expect, it } from "vitest";

import { legacyCookingRefund } from "./legacyRecall";

describe("legacy cooking food recall", () => {
  it("aggregates every stack before flooring the fifty-percent refund", () => {
    const refund = legacyCookingRefund(
      { "food:rustic_bread:normal:base:standard": 1 },
      { "food:rustic_bread:careful:base:extended": 1 },
    );

    expect(refund).toEqual({
      farm: { wheat: 15 },
      fishing: {},
      recalledFoods: 2,
    });
  });

  it("returns recorded rare ingredients and fishing stock at the same aggregate rate", () => {
    const refund = legacyCookingRefund({
      "food:rustic_bread:masterpiece:rare:extended": 2,
      "food:fish_skewer:normal:base:standard": 3,
    });

    expect(refund).toEqual({
      farm: {
        wheat: 15,
        golden_wheat: 1,
        herb: 4,
      },
      fishing: { catch_common: 7 },
      recalledFoods: 5,
    });
  });

  it("ignores malformed, v2, zero, and negative food entries", () => {
    expect(
      legacyCookingRefund({
        bad: 5,
        "food:missing:normal:base:standard": 5,
        "food:rustic_bread:normal:base:standard": 0,
        "food:herb_tea:normal:base:standard": -3,
        "food2:rustic_bread:normal:o0:s0": 10,
      }),
    ).toEqual({ farm: {}, fishing: {}, recalledFoods: 0 });
  });
});
