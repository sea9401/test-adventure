import { describe, expect, it } from "vitest";
import {
  codexResearchArchiveRequestUrl,
  parseCodexResearchArchiveLoadState,
} from "./useCodexResearchArchive";

describe("codex research archive client", () => {
  it("builds stable latest and selected URLs", () => {
    expect(codexResearchArchiveRequestUrl()).toBe("/api/rankings/codex-research/archive");
    expect(codexResearchArchiveRequestUrl("2026-08"))
      .toBe("/api/rankings/codex-research/archive?seasonId=2026-08");
  });

  it("maps closed envelopes and rejects malformed data", () => {
    expect(parseCodexResearchArchiveLoadState({ ok: true, enabled: false }))
      .toEqual({ status: "disabled" });
    expect(parseCodexResearchArchiveLoadState({
      ok: true,
      enabled: true,
      status: "no_season",
      seasons: [],
    })).toEqual({ status: "no_season", seasons: [] });
    expect(() => parseCodexResearchArchiveLoadState({ ok: true, enabled: true }))
      .toThrow("archive response is malformed");
  });
});
