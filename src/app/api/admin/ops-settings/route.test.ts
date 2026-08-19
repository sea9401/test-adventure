import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMasteryFeatures = {
  recordingEnabled: false,
  rankingVisible: false,
  sealsEnabled: false,
  trophiesEnabled: false,
  monthlyProgressEnabled: false,
  monthlyRankingVisible: false,
  settlementEnabled: false,
  feedEnabled: false,
};

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  currentAdminEmail: vi.fn(async () => "owner@example.com"),
  audit: vi.fn(async () => {}),
  upsert: vi.fn(async () => {}),
  readHotTimeSettings: vi.fn(async () => ({
    hotTime: {},
    updatedByEmail: null,
    updatedAt: null,
  })),
  readHotTimeSchedules: vi.fn(async () => ({
    schedules: [],
    updatedByEmail: null,
    updatedAt: null,
  })),
  readAlertThresholdSettings: vi.fn(async () => ({
    alertThresholds: {},
    updatedByEmail: null,
    updatedAt: null,
  })),
  readRewardCompensationPresets: vi.fn(async () => ({
    presets: [],
    updatedByEmail: null,
    updatedAt: null,
  })),
  readOpsNoteTemplates: vi.fn(async () => ({
    templates: [],
    updatedByEmail: null,
    updatedAt: null,
  })),
  readLifeFieldFeatureSettings: vi.fn(async () => ({})),
  readCodexMasteryFeatureSettings: vi.fn(async () => codexMasteryFeatures),
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdmin: mocks.gate,
  currentAdminEmail: mocks.currentAdminEmail,
}));
vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: mocks.audit }));
vi.mock("@/lib/server/opsSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/opsSettings")>()),
  readAlertThresholdSettings: mocks.readAlertThresholdSettings,
  readCodexMasteryFeatureSettings: mocks.readCodexMasteryFeatureSettings,
  readHotTimeSettings: mocks.readHotTimeSettings,
  readHotTimeSchedules: mocks.readHotTimeSchedules,
  readLifeFieldFeatureSettings: mocks.readLifeFieldFeatureSettings,
  readOpsNoteTemplates: mocks.readOpsNoteTemplates,
  readRewardCompensationPresets: mocks.readRewardCompensationPresets,
  upsertOpsSetting: mocks.upsert,
}));

import { GET, POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://test/api/admin/ops-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/ops-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.currentAdminEmail.mockResolvedValue("owner@example.com");
    mocks.readCodexMasteryFeatureSettings.mockResolvedValue(codexMasteryFeatures);
  });

  it("returns codex mastery feature switches from the authenticated admin GET", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      codexMasteryFeatures,
    });
  });

  it("stores parsed codex mastery switches and audits the update", async () => {
    const response = await POST(
      postRequest({ codexMasteryFeatures: { recordingEnabled: true } }),
    );
    const expected = { ...codexMasteryFeatures, recordingEnabled: true };

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      codexMasteryFeatures: expected,
      updatedByEmail: "owner@example.com",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      "codex-mastery-features.v1",
      expected,
      "owner@example.com",
      expect.any(Date),
    );
    expect(mocks.audit).toHaveBeenCalledWith({
      adminEmail: "owner@example.com",
      action: "ops-settings.codex-mastery-features.update",
      detail: expected,
    });
  });

  it("rejects requests without a supported setting", async () => {
    const response = await POST(postRequest({ unsupported: true }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "no setting provided",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects inherited supported setting keys without writing or auditing", async () => {
    const body = Object.create({
      codexMasteryFeatures: { recordingEnabled: true },
    });
    const request = {
      json: vi.fn(async () => body),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "no setting provided",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
