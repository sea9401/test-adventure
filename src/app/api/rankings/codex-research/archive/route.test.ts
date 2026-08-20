import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  settings: { monthlyRankingVisible: false, trophiesEnabled: false },
  readSettings: vi.fn(),
  readArchive: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => mocks.userId) }));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: mocks.readSettings,
}));
vi.mock("@/lib/server/codexResearchArchive", () => ({
  readCodexResearchArchive: mocks.readArchive,
}));

import { GET } from "./route";

describe("/api/rankings/codex-research/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.settings = { monthlyRankingVisible: false, trophiesEnabled: false };
    mocks.readSettings.mockResolvedValue(mocks.settings);
    mocks.readArchive.mockResolvedValue({ status: "no_season", seasons: [] });
  });

  it("requires authentication and gates both public switches before reading", async () => {
    mocks.userId = null;
    expect((await GET(new Request("http://localhost/api/rankings/codex-research/archive"))).status)
      .toBe(401);
    expect(mocks.readSettings).not.toHaveBeenCalled();

    mocks.userId = "user-1";
    let response = await GET(new Request("http://localhost/api/rankings/codex-research/archive"));
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.readArchive).not.toHaveBeenCalled();

    mocks.settings = { monthlyRankingVisible: true, trophiesEnabled: false };
    mocks.readSettings.mockResolvedValue(mocks.settings);
    response = await GET(new Request("http://localhost/api/rankings/codex-research/archive"));
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.readArchive).not.toHaveBeenCalled();
  });

  it("rejects malformed season IDs before archive access", async () => {
    mocks.settings = { monthlyRankingVisible: true, trophiesEnabled: true };
    mocks.readSettings.mockResolvedValue(mocks.settings);
    const response = await GET(new Request(
      "http://localhost/api/rankings/codex-research/archive?seasonId=../../bad",
    ));
    expect(response.status).toBe(400);
    expect(mocks.readArchive).not.toHaveBeenCalled();
  });

  it("returns latest or explicit published archives", async () => {
    mocks.settings = { monthlyRankingVisible: true, trophiesEnabled: true };
    mocks.readSettings.mockResolvedValue(mocks.settings);
    mocks.readArchive.mockResolvedValue({
      status: "ready",
      seasons: [],
      selectedSeasonId: "2026-08",
      list: [],
      nearby: [],
      me: null,
    });
    const response = await GET(new Request(
      "http://localhost/api/rankings/codex-research/archive?seasonId=2026-08",
    ));
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      enabled: true,
      status: "ready",
      selectedSeasonId: "2026-08",
    });
    expect(mocks.readArchive).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      { viewerUserId: "user-1", seasonId: "2026-08" },
    );
  });
});
