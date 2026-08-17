import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    inserted: null as Record<string, unknown> | null,
  };
  const selectBuilder = {
    from: vi.fn(),
    where: vi.fn(async () => [{ value: 0 }]),
  };
  selectBuilder.from.mockReturnValue(selectBuilder);
  return {
    state,
    selectBuilder,
    ensureUser: vi.fn(async () => "viewer-id"),
    resolveSource: vi.fn(),
    resolveActor: vi.fn(async () => ({ name: "신고자" })),
    sendOpsAlert: vi.fn(async () => undefined),
  };
});

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => callback()),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => mocks.selectBuilder),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        mocks.state.inserted = values;
        return { returning: vi.fn(async () => [{ id: 91 }]) };
      }),
    })),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/resolveActor", () => ({
  resolveActor: mocks.resolveActor,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  resolveUgcSource: mocks.resolveSource,
}));
vi.mock("@/lib/server/opsAlert", () => ({
  sendOpsAlert: mocks.sendOpsAlert,
}));

import { POST } from "./route";

function request(
  sourceType: string,
  sourceId: unknown,
  overrides: { subjectType?: string; reason?: string } = {},
) {
  return new Request("http://localhost/api/safety/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectType: overrides.subjectType ?? "content",
      sourceType,
      sourceId,
      reason: overrides.reason ?? "harassment",
      details: "확인해주세요",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.inserted = null;
  mocks.selectBuilder.from.mockReturnValue(mocks.selectBuilder);
  mocks.selectBuilder.where.mockResolvedValue([{ value: 0 }]);
  mocks.resolveSource.mockResolvedValue({
    sourceType: "profile",
    sourceId: "target-user-id",
    targetUserId: "target-user-id",
    targetName: "대상모험가",
    contentSnapshot: "모험가 이름: 대상모험가",
    contextSnapshot: { avatar: "male1" },
  });
});

describe("사용자 콘텐츠 신고 접수", () => {
  it("문자열 프로필 식별자를 서버가 해석한 안정 식별자로 저장하고 알린다", async () => {
    const response = await POST(request("profile", "  대상모험가  "));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, reportId: 91 });
    expect(mocks.resolveSource).toHaveBeenCalledWith(
      "viewer-id",
      "profile",
      "대상모험가",
    );
    expect(mocks.state.inserted).toMatchObject({
      sourceType: "profile",
      sourceId: "target-user-id",
      targetUserId: "target-user-id",
    });
    expect(mocks.sendOpsAlert).toHaveBeenCalledWith(
      "[ops] 사용자 콘텐츠 신고 접수",
      expect.objectContaining({
        alertType: "ugc.report.created",
        reportId: 91,
      }),
    );
  });

  it("기존 숫자 콘텐츠 식별자도 문자열로 정규화한다", async () => {
    mocks.resolveSource.mockResolvedValue({
      sourceType: "bulletin_post",
      sourceId: "42",
      targetUserId: "target-user-id",
      targetName: "대상모험가",
      contentSnapshot: "원문",
      contextSnapshot: {},
    });

    const response = await POST(request("bulletin_post", 42));

    expect(response.status).toBe(201);
    expect(mocks.resolveSource).toHaveBeenCalledWith(
      "viewer-id",
      "bulletin_post",
      "42",
    );
  });

  it("비어 있거나 지나치게 긴 식별자를 거부한다", async () => {
    const empty = await POST(request("profile", "   "));
    const long = await POST(request("profile", "가".repeat(129)));

    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(mocks.resolveSource).not.toHaveBeenCalled();
  });

  it("거래 전용 사유로 체결 스냅샷을 저장하고 양쪽 계정을 알린다", async () => {
    mocks.resolveSource.mockResolvedValue({
      sourceType: "marketplace_trade",
      sourceId: "42",
      targetUserId: "seller-id",
      targetName: "판매자",
      contentSnapshot: "거래 번호: 42",
      contextSnapshot: {
        seller: { userId: "seller-id", name: "판매자" },
        buyer: { userId: "buyer-id", name: "구매자" },
      },
      relatedAccounts: [
        { userId: "seller-id", name: "판매자" },
        { userId: "buyer-id", name: "구매자" },
      ],
    });

    const response = await POST(
      request("marketplace_trade", 42, { reason: "abnormal_price" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.state.inserted).toMatchObject({
      sourceType: "marketplace_trade",
      sourceId: "42",
      reason: "abnormal_price",
      contentSnapshot: "거래 번호: 42",
    });
    expect(mocks.sendOpsAlert).toHaveBeenCalledWith(
      "[ops] 사용자 콘텐츠 신고 접수",
      expect.objectContaining({
        accounts: [
          { userId: "viewer-id", name: "신고자" },
          { userId: "seller-id", name: "판매자" },
          { userId: "buyer-id", name: "구매자" },
        ],
      }),
    );
  });

  it("거래 신고의 사용자 대상과 콘텐츠 전용 사유를 거부한다", async () => {
    const userSubject = await POST(
      request("marketplace_trade", 42, {
        subjectType: "user",
        reason: "abnormal_price",
      }),
    );
    const contentReason = await POST(
      request("marketplace_trade", 42, { reason: "harassment" }),
    );

    expect(userSubject.status).toBe(400);
    expect(contentReason.status).toBe(400);
    expect(mocks.resolveSource).not.toHaveBeenCalled();
  });
});
