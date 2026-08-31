import { beforeEach, describe, expect, it, vi } from "vitest";

const ranking = {
  list: [{ rank: 1, name: "연구가" }],
  nearby: [{ rank: 1, name: "연구가" }],
  me: { rank: 1, name: "연구가" },
};

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  settings: { rankingVisible: false },
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
vi.mock("@/lib/server/codexMasteryRanking", () => ({
  readCodexMasteryRanking: mocks.readRanking,
}));
vi.mock("@/lib/server/isAdmin", () => ({
  getAdminEmailsList: mocks.getAdminEmails,
}));

import { GET } from "./route";

function request(scope = "overall") {
  return new Request(
    `http://test/api/rankings/codex-mastery?scope=${scope}`,
  );
}

describe("/api/rankings/codex-mastery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.settings.rankingVisible = false;
    mocks.readSettings.mockResolvedValue(mocks.settings);
    mocks.readRanking.mockResolvedValue(ranking);
    mocks.getAdminEmails.mockReturnValue(["admin@example.com"]);
  });

  it("rejects unauthenticated requests before settings or ranking reads", async () => {
    mocks.userId = null;

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(mocks.readSettings).not.toHaveBeenCalled();
    expect(mocks.readRanking).not.toHaveBeenCalled();
  });

  it("rejects unknown and repeated scopes", async () => {
    const unknown = await GET(request("monthly"));
    const repeated = await GET(new Request(
      "http://test/api/rankings/codex-mastery?scope=overall&scope=fish",
    ));

    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toEqual({
      ok: false,
      error: "invalid_scope",
    });
    expect(repeated.status).toBe(400);
    expect(mocks.readSettings).not.toHaveBeenCalled();
    expect(mocks.readRanking).not.toHaveBeenCalled();
  });

  it("returns early without a summary query while rankings are hidden", async () => {
    const response = await GET(request("fish"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.readSettings).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
    );
    expect(mocks.readRanking).not.toHaveBeenCalled();
  });

  it("returns the requested permanent ranking while visible", async () => {
    mocks.settings.rankingVisible = true;

    const response = await GET(request("monster"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: true,
      scope: "monster",
      ...ranking,
    });
    expect(mocks.getAdminEmails).toHaveBeenCalledTimes(1);
    expect(mocks.readRanking).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      {
        viewerUserId: "user-1",
        scope: "monster",
        adminEmails: ["admin@example.com"],
      },
    );
  });
});
