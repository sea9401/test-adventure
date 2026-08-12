import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  currentAdminEmail: vi.fn(async () => "owner@example.com"),
  audit: vi.fn(async () => {}),
  abuse: vi.fn(),
  read: vi.fn(async () => ({} as unknown)),
  lock: vi.fn(async () => ({} as unknown)),
  upsert: vi.fn(
    async (_tx: unknown, _userId: string, _key: string, _value: unknown) => {},
  ),
  transaction: vi.fn(),
  targetRows: [
    { id: "target-user", gameName: "대상 모험가" },
  ] as Array<{ id: string; gameName: string | null }>,
  turnstileConfigured: true,
  captchaConfigured: true,
  tx: { kind: "transaction" },
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
  currentAdminEmail: mocks.currentAdminEmail,
}));
vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: mocks.audit }));
vi.mock("@/lib/server/abuseLog", () => ({
  recordAbuseEventSoon: mocks.abuse,
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: mocks.read,
  lockSaveForUpdate: mocks.lock,
  upsertSave: mocks.upsert,
}));
vi.mock("@/lib/server/turnstile", () => ({
  turnstileConfig: () => ({
    configured: mocks.turnstileConfigured,
    siteKey: mocks.turnstileConfigured ? "turnstile-site" : null,
  }),
}));
vi.mock("@/lib/server/hcaptcha", () => ({
  hcaptchaConfig: () => ({
    configured: mocks.captchaConfigured,
    siteKey: mocks.captchaConfigured ? "captcha-site" : null,
  }),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.targetRows),
        })),
      })),
    })),
    transaction: mocks.transaction,
  },
}));

import {
  activeManualActivityVerification,
  emptyActivityGuardState,
  parseActivityGuardState,
  recordActivityCompletion,
  setManualActivityVerification,
} from "@/lib/server/activityGuard";
import { DELETE, GET, POST } from "./route";

function jsonRequest(method: "POST" | "DELETE", body: unknown): Request {
  return new Request(
    "http://test/api/admin/users/activity-verification",
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("/api/admin/users/activity-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.targetRows = [{ id: "target-user", gameName: "대상 모험가" }];
    mocks.turnstileConfigured = true;
    mocks.captchaConfigured = true;
    mocks.read.mockResolvedValue({});
    mocks.lock.mockResolvedValue({});
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof mocks.tx) => Promise<unknown>) =>
        callback(mocks.tx),
    );
  });

  it("최고 관리자가 활동별 활성 요청과 CAPTCHA 설정 상태를 조회한다", async () => {
    const now = Date.now();
    mocks.read.mockResolvedValue(
      setManualActivityVerification(
        emptyActivityGuardState(),
        "woodcutting",
        "captcha",
        now,
      ),
    );

    const response = await GET(
      new Request(
        "http://test/api/admin/users/activity-verification?userId=target-user",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      turnstileConfigured: true,
      captchaConfigured: true,
      requests: {
        fishing: null,
        woodcutting: { mode: "captcha", requestedAt: now },
        mining: null,
      },
    });
  });

  it("다음 행동용 2단계 확인을 설정하고 감사·운영 이력을 남긴다", async () => {
    const response = await POST(
      jsonRequest("POST", {
        userId: "target-user",
        activity: "mining",
        mode: "captcha",
      }),
    );

    expect(response.status).toBe(200);
    const saved = parseActivityGuardState(mocks.upsert.mock.calls[0]?.[3]);
    expect(
      activeManualActivityVerification(saved, "mining", Date.now()),
    ).toMatchObject({ mode: "captcha" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity-verification.manual-require",
        targetUserId: "target-user",
        detail: expect.objectContaining({ activity: "mining", mode: "captcha" }),
      }),
    );
    expect(mocks.abuse).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "v2:mining:human-check",
        reason: "human_verification_required",
        detail: expect.objectContaining({ manualTest: true, mode: "captcha" }),
      }),
    );
  });

  it("활성 관리자 요청을 취소하고 실제 위험 상태는 보존한다", async () => {
    let state = recordActivityCompletion(
      emptyActivityGuardState(),
      "fishing",
      10_000,
    ).state;
    state = setManualActivityVerification(
      state,
      "fishing",
      "standard",
      Date.now(),
    );
    mocks.lock.mockResolvedValue(state);

    const response = await DELETE(
      jsonRequest("DELETE", {
        userId: "target-user",
        activity: "fishing",
      }),
    );

    expect(response.status).toBe(200);
    const saved = parseActivityGuardState(mocks.upsert.mock.calls[0]?.[3]);
    expect(activeManualActivityVerification(saved, "fishing")).toBeNull();
    expect(saved.activities.fishing.completedSinceVerification).toBe(1);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity-verification.manual-cancel",
        targetUserId: "target-user",
      }),
    );
  });

  it("hCaptcha가 설정되지 않으면 2단계 요청을 거절한다", async () => {
    mocks.captchaConfigured = false;

    const response = await POST(
      jsonRequest("POST", {
        userId: "target-user",
        activity: "fishing",
        mode: "captcha",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "captcha_unconfigured",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("실제 활동 판정이 이미 대기 중이면 관리자 요청으로 덮어쓰지 않는다", async () => {
    let state = emptyActivityGuardState();
    for (let index = 0; index < 500; index += 1) {
      state = recordActivityCompletion(state, "woodcutting", 10_000 + index).state;
    }
    mocks.lock.mockResolvedValue(state);

    const response = await POST(
      jsonRequest("POST", {
        userId: "target-user",
        activity: "woodcutting",
        mode: "standard",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "organic_verification_pending",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("최고 관리자 권한이 없으면 상태를 변경하지 않는다", async () => {
    mocks.gate.mockResolvedValue(
      Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    );

    const response = await POST(
      jsonRequest("POST", {
        userId: "target-user",
        activity: "fishing",
        mode: "standard",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("지원하지 않는 활동과 존재하지 않는 유저를 거절한다", async () => {
    const invalid = await POST(
      jsonRequest("POST", {
        userId: "target-user",
        activity: "farming",
        mode: "standard",
      }),
    );
    expect(invalid.status).toBe(400);

    mocks.targetRows = [];
    const missing = await POST(
      jsonRequest("POST", {
        userId: "missing-user",
        activity: "fishing",
        mode: "standard",
      }),
    );
    expect(missing.status).toBe(404);
  });
});
