import { describe, expect, it } from "vitest";
import {
  codexResearchRankingRequestUrl,
  parseCodexResearchRankingResponse,
} from "./useCodexResearchRanking";

const row = {
  rank: 1,
  name: "연구가",
  avatar: "male1",
  score: 19_000,
  objectiveCompletedCount: 18,
  objectiveScore: 12_000,
  diversityScore: 4_000,
  recordScore: 3_000,
  provisionalTier: "legendary",
  mine: true,
  profileBorder: null,
  chatNameEffect: null,
};

describe("monthly codex ranking client parser", () => {
  it("uses a stable endpoint and preserves disabled/no-season states", () => {
    expect(codexResearchRankingRequestUrl()).toBe("/api/rankings/codex-research");
    expect(parseCodexResearchRankingResponse({ ok: true, enabled: false }))
      .toEqual({ status: "disabled" });
    expect(parseCodexResearchRankingResponse({
      ok: true,
      enabled: true,
      status: "no_season",
    })).toEqual({ status: "no_season" });
  });

  it("accepts a complete active season and rejects malformed score components", () => {
    const active = {
      ok: true,
      enabled: true,
      status: "active",
      seasonId: "2026-08",
      themeId: "rivers-and-lakes",
      themeName: "강과 호수의 달",
      startAt: "2026-07-31T15:00:00.000Z",
      endAt: "2026-08-31T15:00:00.000Z",
      list: [row],
      nearby: [row],
      me: row,
    };
    expect(parseCodexResearchRankingResponse(active)).toMatchObject({
      status: "ready",
      data: { seasonId: "2026-08", me: { rank: 1 } },
    });
    expect(() => parseCodexResearchRankingResponse({
      ...active,
      list: [{ ...row, objectiveScore: 11_999 }],
    })).toThrow("invalid monthly ranking response");
  });
});
