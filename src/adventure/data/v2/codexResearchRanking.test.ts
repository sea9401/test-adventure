import { describe, expect, it } from "vitest";
import { codexResearchTierFor } from "./codexResearchRanking";

describe("monthly codex research trophy tiers", () => {
  it.each([
    [3_999, 1, null],
    [4_000, 999, "bronze"],
    [7_999, 1, "bronze"],
    [8_000, 999, "silver"],
    [11_999, 1, "silver"],
    [12_000, 999, "gold"],
    [15_999, 1, "gold"],
    [16_000, 10, "diamond"],
    [16_000, 11, "platinum"],
    [17_999, 3, "diamond"],
    [18_000, 3, "legendary"],
    [18_000, 4, "diamond"],
    [20_000, null, "platinum"],
  ] as const)(
    "assigns score %i at rank %s to %s",
    (score, rank, expected) => {
      expect(codexResearchTierFor(score, rank)).toBe(expected);
    },
  );

  it.each([
    [-1, 1],
    [20_001, 1],
    [1.5, 1],
    [4_000, 0],
    [4_000, -1],
    [4_000, 1.5],
    [4_000, Number.MAX_SAFE_INTEGER + 1],
  ])("rejects an unsafe score/rank pair %s/%s", (score, rank) => {
    expect(() => codexResearchTierFor(score, rank)).toThrow(
      "monthly codex rank input is invalid",
    );
  });
});
