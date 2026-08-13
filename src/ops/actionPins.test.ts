import { describe, expect, it } from "vitest";
import { findUnpinnedActions } from "../../scripts/check-action-pins.mjs";

describe("GitHub Actions immutable reference guard", () => {
  it("movable tags and branches are reported with their workflow location", () => {
    expect(
      findUnpinnedActions(
        "steps:\n  - uses: actions/checkout@v7\n  - uses: vendor/tool@main\n",
        "sample.yml",
      ),
    ).toEqual([
      "sample.yml:2 actions/checkout@v7",
      "sample.yml:3 vendor/tool@main",
    ]);
  });

  it("accepts a full commit SHA and ignores local or docker actions", () => {
    expect(
      findUnpinnedActions(
        [
          "steps:",
          "  - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v7",
          "  - uses: ./github/actions/local",
          "  - uses: docker://alpine:3.20",
          "  # - uses: vendor/documentation-example@v1",
        ].join("\n"),
        "sample.yml",
      ),
    ).toEqual([]);
  });
});
