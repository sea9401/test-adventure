import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCodexMasterySummary } from "@/lib/server/codexMasteryRepository";

const snapshot = {
  summary: {
    totalScore: 10,
    discoveredCount: 1,
    totalEntries: 679,
    sealCount: 0,
    stageCounts: {
      bronze: 1,
      silver: 0,
      gold: 0,
      platinum: 0,
      diamond: 0,
      legendary: 0,
    },
  },
  categories: [],
  entries: [],
  pinnedGoals: [],
  recentPromotions: [],
  nearGoals: [],
  monthlyResearch: null,
  features: {
    rankingVisible: false,
    sealsEnabled: false,
    trophiesEnabled: false,
    monthlyProgressEnabled: false,
  },
};

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  settings: {
    recordingEnabled: false,
    overviewVisible: false,
    rankingVisible: false,
    sealsEnabled: false,
    trophiesEnabled: false,
    monthlyProgressEnabled: false,
    monthlyRankingVisible: false,
    settlementEnabled: false,
    feedEnabled: false,
  },
  readSettings: vi.fn(),
  readSummary: vi.fn(),
  readProgress: vi.fn(),
  readPins: vi.fn(),
  readMonthly: vi.fn(),
  writePins: vi.fn(),
  buildSnapshot: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction, marker: "db" },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: mocks.readSettings,
}));
vi.mock("@/lib/server/codexMasteryRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/codexMasteryRepository")>()),
  readCodexMasterySummary: mocks.readSummary,
  readCodexMasteryProgressRows: mocks.readProgress,
}));
vi.mock("@/lib/server/codexMasteryPins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/codexMasteryPins")>()),
  readCodexMasteryPins: mocks.readPins,
  writeCodexMasteryPins: mocks.writePins,
}));
vi.mock("@/lib/server/codexMasterySnapshot", () => ({
  buildCodexMasterySnapshot: mocks.buildSnapshot,
}));
vi.mock("@/lib/server/codexResearchService", () => ({
  readCodexResearchPersonalView: mocks.readMonthly,
}));

import { GET, POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://test/api/v2/me/codex-mastery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/v2/me/codex-mastery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.settings.overviewVisible = false;
    mocks.readSettings.mockResolvedValue(mocks.settings);
    mocks.readSummary.mockResolvedValue(emptyCodexMasterySummary());
    mocks.readProgress.mockResolvedValue([]);
    mocks.readPins.mockResolvedValue([]);
    mocks.readMonthly.mockResolvedValue({ status: "no_season" });
    mocks.writePins.mockImplementation(async (_tx, _userId, entries) => entries);
    mocks.buildSnapshot.mockReturnValue(snapshot);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ marker: "tx" })
    );
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(postRequest({ pinnedGoals: [] }))],
  ])("rejects an unauthenticated %s", async (_method, request) => {
    mocks.userId = null;

    const response = await request();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(mocks.readSettings).not.toHaveBeenCalled();
  });

  it("returns early without mastery reads while the overview is hidden", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.readSettings).toHaveBeenCalledWith(expect.objectContaining({ marker: "db" }));
    expect(mocks.readSummary).not.toHaveBeenCalled();
    expect(mocks.readProgress).not.toHaveBeenCalled();
    expect(mocks.readPins).not.toHaveBeenCalled();
    expect(mocks.readMonthly).not.toHaveBeenCalled();
    expect(mocks.buildSnapshot).not.toHaveBeenCalled();
  });

  it("returns one authoritative snapshot while visible", async () => {
    mocks.settings.overviewVisible = true;
    const summary = emptyCodexMasterySummary();
    const progressRows = [{ category: "fish", entryId: "carp" }];
    const pins = [{ category: "fish", entryId: "carp" }];
    mocks.readSummary.mockResolvedValue(summary);
    mocks.readProgress.mockResolvedValue(progressRows);
    mocks.readPins.mockResolvedValue(pins);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      enabled: true,
      snapshot,
    });
    expect(mocks.readSummary).toHaveBeenCalledWith(expect.objectContaining({ marker: "db" }), "user-1");
    expect(mocks.readProgress).toHaveBeenCalledWith(expect.objectContaining({ marker: "db" }), "user-1");
    expect(mocks.readPins).toHaveBeenCalledWith(expect.objectContaining({ marker: "db" }), "user-1");
    expect(mocks.buildSnapshot).toHaveBeenCalledWith({
      summary,
      progressRows,
      pinnedGoals: pins,
      features: {
        rankingVisible: false,
        sealsEnabled: false,
        trophiesEnabled: false,
        monthlyProgressEnabled: false,
      },
      monthlyResearch: null,
    });
    expect(mocks.readMonthly).not.toHaveBeenCalled();
  });

  it("reads one personal monthly view only while monthly progress is enabled", async () => {
    mocks.settings.overviewVisible = true;
    mocks.settings.monthlyProgressEnabled = true;
    const monthlyResearch = {
      status: "active",
      seasonId: "2026-08",
      themeName: "강과 호수의 달",
    };
    mocks.readMonthly.mockResolvedValue(monthlyResearch);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.readMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      "user-1",
    );
    expect(mocks.buildSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      monthlyResearch,
      features: expect.objectContaining({ monthlyProgressEnabled: true }),
    }));
  });

  it("does not open a transaction for hidden pin updates", async () => {
    const response = await POST(postRequest({ pinnedGoals: [] }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "feature_disabled",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and strict invalid pins", async () => {
    mocks.settings.overviewVisible = true;
    const malformed = await POST(new Request(
      "http://test/api/v2/me/codex-mastery",
      { method: "POST", body: "{" },
    ));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      ok: false,
      error: "invalid_json",
    });

    const invalid = await POST(postRequest({
      pinnedGoals: [{ category: "fish", entryId: "not-in-catalog" }],
    }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      ok: false,
      error: "unknown_pin",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("transactionally replaces a valid tracked-goal list", async () => {
    mocks.settings.overviewVisible = true;
    const pinnedGoals = [{ category: "fish", entryId: "crucian_carp" }];

    const response = await POST(postRequest({ pinnedGoals }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, pinnedGoals });
    expect(mocks.writePins).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "tx" }),
      "user-1",
      pinnedGoals,
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
