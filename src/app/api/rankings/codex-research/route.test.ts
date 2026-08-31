import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  settings: { monthlyRankingVisible: false },
  readSettings: vi.fn(),
  readRanking: vi.fn(),
  getAdminEmails: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: mocks.readSettings,
}));
vi.mock("@/lib/server/codexResearchRanking", () => ({
  readCodexResearchRanking: mocks.readRanking,
}));
vi.mock("@/lib/server/isAdmin", () => ({
  getAdminEmailsList: mocks.getAdminEmails,
}));

import { GET } from "./route";

describe("/api/rankings/codex-research", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.settings.monthlyRankingVisible = false;
    mocks.readSettings.mockResolvedValue(mocks.settings);
    mocks.readRanking.mockResolvedValue({ status: "no_season" });
    mocks.getAdminEmails.mockReturnValue(["admin@example.com"]);
  });

  it("requires authentication before reading feature settings", async () => {
    mocks.userId = null;
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.readSettings).not.toHaveBeenCalled();
  });

  it("returns disabled without querying monthly progress", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.readRanking).not.toHaveBeenCalled();
  });

  it("returns no-season and active ranking states behind the visibility flag", async () => {
    mocks.settings.monthlyRankingVisible = true;
    const noSeason = await GET();
    await expect(noSeason.json()).resolves.toEqual({
      ok: true,
      enabled: true,
      status: "no_season",
    });

    mocks.readRanking.mockResolvedValueOnce({
      status: "active",
      seasonId: "2026-08",
      themeId: "rivers-and-lakes",
      themeName: "강과 호수의 달",
      startAt: "2026-07-31T15:00:00.000Z",
      endAt: "2026-08-31T15:00:00.000Z",
      list: [],
      nearby: [],
      me: null,
    });
    const active = await GET();
    await expect(active.json()).resolves.toMatchObject({
      ok: true,
      enabled: true,
      status: "active",
      seasonId: "2026-08",
    });
    expect(mocks.readRanking).toHaveBeenLastCalledWith(
      expect.objectContaining({ marker: "db" }),
      {
        viewerUserId: "user-1",
        adminEmails: ["admin@example.com"],
      },
    );
  });
});
