import { beforeEach, describe, expect, it, vi } from "vitest";

const FEATURES = {
  recordingEnabled: false,
  overviewVisible: false,
  rankingVisible: false,
  sealsEnabled: false,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
  monthlyRankingVisible: false,
  settlementEnabled: false,
  feedEnabled: false,
};

const mocks = vi.hoisted(() => {
  const tx = { marker: "tx" };
  return {
    tx,
    transaction: vi.fn(async (run: (executor: typeof tx) => unknown) => run(tx)),
    adminGate: vi.fn(async () => null as Response | null),
    roleGate: vi.fn(async () => null as Response | null),
    currentAdminEmail: vi.fn(async () => "owner@example.com"),
    adminEmails: vi.fn(() => ["owner@example.com"]),
    audit: vi.fn(async () => undefined),
    list: vi.fn(async () => [{ seasonId: "2026-08", opsState: "closed" }]),
    settings: vi.fn(),
    definitionPreview: vi.fn(() => ({
      seasonId: "2026-09",
      themeId: "river",
      objectiveCount: 18,
      schedulable: true,
    })),
    schedule: vi.fn(async () => ({
      seasonId: "2026-09",
      status: "scheduled",
      startAt: new Date("2026-08-31T15:00:00.000Z"),
      endAt: new Date("2026-09-30T15:00:00.000Z"),
    })),
    settlementPreview: vi.fn(async () => ({
      seasonId: "2026-08",
      participantCount: 2,
      tierCounts: { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 1, legendary: 1 },
      untieredCount: 0,
      top: [{ userId: "user-1", rank: 1, score: 18_000, tier: "legendary" }],
    })),
    settle: vi.fn(async () => ({
      status: "settled",
      seasonId: "2026-08",
      participantCount: 2,
      tierCounts: { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 1, legendary: 1 },
    })),
    resettle: vi.fn(async () => ({
      status: "resettled",
      seasonId: "2026-08",
      participantCount: 2,
      tierCounts: { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 1, legendary: 1 },
    })),
    award: vi.fn(async () => ({
      status: "awarded",
      seasonId: "2026-08",
      eligibleCount: 2,
      createdCount: 2,
      existingCount: 0,
    })),
  };
});

vi.mock("@/db", () => ({
  db: { marker: "db", transaction: mocks.transaction },
}));
vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: mocks.adminGate,
  requireAdminRole: mocks.roleGate,
  currentAdminEmail: mocks.currentAdminEmail,
  getAdminEmailsList: mocks.adminEmails,
}));
vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: mocks.audit }));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: mocks.settings,
}));
vi.mock("@/lib/server/codexResearchOpsRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/codexResearchOpsRepository")>()),
  readCodexResearchSeasonOpsList: mocks.list,
}));
vi.mock("@/adventure/data/v2/codexResearchOps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/data/v2/codexResearchOps")>()),
  previewCodexResearchDefinition: mocks.definitionPreview,
  codexResearchConfirmation: (op: string, seasonId: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(seasonId)) {
      throw new Error("seasonId must use YYYY-MM");
    }
    return `${{
      schedule: "SCHEDULE",
      settle: "SETTLE",
      resettle: "RESETTLE",
      "award-trophies": "AWARD",
    }[op]} ${seasonId}`;
  },
}));
vi.mock("@/lib/server/codexResearchOps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/codexResearchOps")>()),
  previewCodexResearchSettlementForOps: mocks.settlementPreview,
  scheduleCodexResearchSeasonForOps: mocks.schedule,
  resettleCodexResearchSeason: mocks.resettle,
}));
vi.mock("@/lib/server/codexResearchSettlement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/codexResearchSettlement")>()),
  settleCodexResearchSeason: mocks.settle,
}));
vi.mock("@/lib/server/codexResearchTrophies", () => ({
  awardCodexResearchSeasonTrophies: mocks.award,
}));

import { CodexResearchOpsError } from "@/lib/server/codexResearchOps";
import { GET, POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://test/api/admin/codex-research-seasons", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/codex-research-seasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminGate.mockResolvedValue(null);
    mocks.roleGate.mockResolvedValue(null);
    mocks.currentAdminEmail.mockResolvedValue("owner@example.com");
    mocks.adminEmails.mockReturnValue(["owner@example.com"]);
    mocks.settings.mockResolvedValue({ ...FEATURES });
  });

  it("gates GET as admin and returns recent seasons with operation switches", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      seasons: [{ seasonId: "2026-08", opsState: "closed" }],
      features: { settlementEnabled: false, trophiesEnabled: false },
    });
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      expect.any(Date),
      24,
    );

    mocks.adminGate.mockResolvedValue(new Response("forbidden", { status: 403 }));
    const forbidden = await GET();
    expect(forbidden.status).toBe(403);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("requires super before parsing or auditing a POST", async () => {
    mocks.roleGate.mockResolvedValue(new Response("forbidden", { status: 403 }));
    const request = { json: vi.fn() } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.roleGate).toHaveBeenCalledWith("super");
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects inherited and unknown operations without invoking an engine", async () => {
    const inheritedBody = Object.create({ op: "settle" });
    const inherited = await POST({
      json: vi.fn(async () => inheritedBody),
    } as unknown as Request);
    expect(inherited.status).toBe(400);
    await expect(inherited.json()).resolves.toMatchObject({
      ok: false,
      error: "unknown_op",
    });

    const unknown = await POST(post({ op: "deploy" }));
    expect(unknown.status).toBe(400);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith({
      adminEmail: "owner@example.com",
      action: "codex-research.invalid",
      detail: { status: "failed", error: "unknown_op" },
    });
  });

  it("validates without a transaction and audits only the summary", async () => {
    const submitted = { seasonId: "2026-09", secret: "do-not-log" };
    const response = await POST(post({ op: "validate", definition: submitted }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      op: "validate",
      preview: { seasonId: "2026-09", objectiveCount: 18 },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith({
      adminEmail: "owner@example.com",
      action: "codex-research.validate",
      detail: {
        status: "success",
        seasonId: "2026-09",
        objectiveCount: 18,
      },
    });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("do-not-log");
  });

  it("rejects a confirmation mismatch before feature or database access", async () => {
    const response = await POST(post({
      op: "schedule",
      definition: { seasonId: "2026-09" },
      confirm: "yes",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "confirm_mismatch",
    });
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("rejects a malformed season ID before any repository read", async () => {
    const response = await POST(post({
      op: "preview-settlement",
      seasonId: "next-month",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
    });
    expect(mocks.settlementPreview).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps settlement and trophy engines off behind their feature flags", async () => {
    const settleResponse = await POST(post({
      op: "settle",
      seasonId: "2026-08",
      confirm: "SETTLE 2026-08",
    }));
    expect(settleResponse.status).toBe(409);
    await expect(settleResponse.json()).resolves.toMatchObject({
      error: "feature_disabled",
    });
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.settings.mockResolvedValue({
      ...FEATURES,
      settlementEnabled: true,
      trophiesEnabled: false,
    });
    const trophyResponse = await POST(post({
      op: "award-trophies",
      seasonId: "2026-08",
      confirm: "AWARD 2026-08",
    }));
    expect(trophyResponse.status).toBe(409);
    expect(mocks.award).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("runs preview read-only and mutations in caller-owned transactions", async () => {
    const preview = await POST(post({
      op: "preview-settlement",
      seasonId: "2026-08",
    }));
    expect(preview.status).toBe(200);
    expect(mocks.settlementPreview).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "db" }),
      {
        seasonId: "2026-08",
        adminEmails: ["owner@example.com"],
        now: expect.any(Date),
      },
    );
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.settings.mockResolvedValue({
      ...FEATURES,
      settlementEnabled: true,
    });
    const settle = await POST(post({
      op: "settle",
      seasonId: "2026-08",
      confirm: "SETTLE 2026-08",
    }));
    expect(settle.status).toBe(200);
    expect(mocks.settle).toHaveBeenCalledWith(mocks.tx, {
      seasonId: "2026-08",
      adminEmails: ["owner@example.com"],
      now: expect.any(Date),
    });
    expect(mocks.audit).toHaveBeenLastCalledWith({
      adminEmail: "owner@example.com",
      action: "codex-research.settle",
      detail: {
        status: "success",
        seasonId: "2026-08",
        participantCount: 2,
        tierCounts: expect.any(Object),
      },
    });
  });

  it("maps stable operation errors and audits failure without submitted rows", async () => {
    mocks.settlementPreview.mockRejectedValueOnce(new CodexResearchOpsError(
      "season_not_found",
      404,
      "시즌이 없습니다.",
    ));

    const response = await POST(post({
      op: "preview-settlement",
      seasonId: "2026-08",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "season_not_found",
      message: "시즌이 없습니다.",
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      adminEmail: "owner@example.com",
      action: "codex-research.preview-settlement",
      detail: {
        status: "failed",
        seasonId: "2026-08",
        error: "season_not_found",
      },
    });
  });
});
