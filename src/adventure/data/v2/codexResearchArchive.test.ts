import { describe, expect, it } from "vitest";
import { parseCodexResearchArchiveResponse } from "./codexResearchArchive";

function response() {
  return {
    ok: true,
    enabled: true,
    status: "ready",
    seasons: [{
      seasonId: "2026-08",
      themeId: "rivers-and-lakes",
      themeName: "강과 호수의 달",
      startAt: "2026-07-31T15:00:00.000Z",
      endAt: "2026-08-31T15:00:00.000Z",
      settledAt: "2026-08-31T16:00:00.000Z",
      publishedAt: "2026-08-31T17:00:00.000Z",
      participantCount: 3,
      trophyCount: 2,
    }],
    selectedSeasonId: "2026-08",
    list: [{
      rank: 1,
      name: "수집왕",
      avatar: "female2",
      score: 19_000,
      objectiveCompletedCount: 18,
      objectiveScore: 11_000,
      diversityScore: 5_000,
      recordScore: 3_000,
      finalTier: "legendary",
      mine: false,
      profileBorder: null,
      chatNameEffect: null,
      firstPlaceEngraving: true,
    }],
    nearby: [],
    me: null,
  };
}

describe("codex research archive contract", () => {
  it("strictly parses and clones a ready response", () => {
    const raw = response();
    const parsed = parseCodexResearchArchiveResponse(raw);

    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect((parsed as { seasons: unknown }).seasons).not.toBe(raw.seasons);
  });

  it("accepts closed envelopes and rejects malformed fixed results", () => {
    expect(parseCodexResearchArchiveResponse({ ok: true, enabled: false }))
      .toEqual({ ok: true, enabled: false });
    expect(parseCodexResearchArchiveResponse({
      ok: true,
      enabled: true,
      status: "no_season",
      seasons: [],
    })).toMatchObject({ status: "no_season" });

    expect(() => parseCodexResearchArchiveResponse({
      ...response(),
      list: [{ ...response().list[0], finalTier: "mythic" }],
    })).toThrow("archive response is malformed");
    expect(() => parseCodexResearchArchiveResponse({
      ...response(),
      list: [{ ...response().list[0], rank: 0 }],
    })).toThrow("archive response is malformed");
    expect(() => parseCodexResearchArchiveResponse({
      ...response(),
      seasons: [{ ...response().seasons[0], publishedAt: "not-a-date" }],
    })).toThrow("archive response is malformed");
  });
});
