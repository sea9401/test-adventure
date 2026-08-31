import { describe, expect, it } from "vitest";
import {
  codexMasteryRankingRequestUrl,
  parseCodexMasteryRankingResponse,
  shouldLoadCodexMasteryRanking,
} from "./useCodexMasteryRanking";

const row = {
  rank: 1,
  name: "연구가",
  avatar: "male1",
  score: 120,
  totalScore: 500,
  categoryScores: {
    equipment: 100,
    fish: 80,
    monster: 70,
    cooking: 60,
    life: 90,
    job: 100,
  },
  stageCounts: {
    bronze: 10,
    silver: 8,
    gold: 6,
    platinum: 4,
    diamond: 2,
    legendary: 1,
  },
  goldOrHigherCount: 6,
  sealCount: 3,
  scoredCategoryCount: 6,
  mine: true,
  profileBorder: null,
  chatNameEffect: null,
};

describe("codex mastery ranking loader", () => {
  it("builds a closed, encoded scope URL", () => {
    expect(codexMasteryRankingRequestUrl("overall")).toBe(
      "/api/rankings/codex-mastery?scope=overall",
    );
    expect(codexMasteryRankingRequestUrl("fish")).toBe(
      "/api/rankings/codex-mastery?scope=fish",
    );
  });

  it("loads only an active scope without retained or in-flight state", () => {
    expect(shouldLoadCodexMasteryRanking(false, undefined)).toBe(false);
    expect(shouldLoadCodexMasteryRanking(true, undefined)).toBe(true);
    expect(shouldLoadCodexMasteryRanking(true, { status: "loading" })).toBe(false);
    expect(shouldLoadCodexMasteryRanking(true, { status: "ready", data: {} as never }))
      .toBe(false);
    expect(shouldLoadCodexMasteryRanking(true, { status: "error" })).toBe(false);
  });

  it("parses disabled and scope-matched enabled responses", () => {
    expect(parseCodexMasteryRankingResponse(
      { ok: true, enabled: false },
      "overall",
    )).toEqual({ status: "disabled" });

    const enabled = {
      ok: true,
      enabled: true,
      scope: "fish",
      list: [row],
      nearby: [row],
      me: row,
    };
    expect(parseCodexMasteryRankingResponse(enabled, "fish")).toEqual({
      status: "ready",
      data: enabled,
    });
  });

  it("rejects errors, mismatched scopes, and malformed rows", () => {
    expect(() => parseCodexMasteryRankingResponse(
      { ok: false, error: "nope" },
      "overall",
    )).toThrow("nope");
    expect(() => parseCodexMasteryRankingResponse({
      ok: true,
      enabled: true,
      scope: "job",
      list: [row],
      nearby: [],
      me: null,
    }, "fish")).toThrow("invalid ranking response");
    expect(() => parseCodexMasteryRankingResponse({
      ok: true,
      enabled: true,
      scope: "fish",
      list: [{ rank: 1 }],
      nearby: [],
      me: null,
    }, "fish")).toThrow("invalid ranking response");
  });
});
