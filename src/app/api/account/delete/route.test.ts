import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  impersonation: null as { targetUserId: string } | null,
  sessionFailure: null as Response | null,
  userRows: [] as Row[],
  transactionRows: [] as Row[][],
  queuedTargets: [] as Row[],
  queuedRows: [] as Array<{ id: number }>,
  inboxRows: [] as Row[],
  updates: [] as Row[],
  deleteUser: vi.fn(async () => undefined),
  clearAffiliation: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  processStorageQueue: vi.fn(async () => ({
    attempted: 0,
    completed: 0,
    failed: 0,
    objectsDeleted: 0,
  })),
  sendOpsAlert: vi.fn(async () => undefined),
  preserveReferral: vi.fn(async () => undefined),
  lockActiveTradeExposure: vi.fn(async () => ({
    participantUserIds: ["user-1"],
    listings: [] as Row[],
    buyOrders: [] as Row[],
  })),
}));

function queryResult(rows: Row[]) {
  const promise = Promise.resolve(rows);
  return {
    limit: vi.fn(async () => rows),
    for: vi.fn(async () => rows),
    then: promise.then.bind(promise),
  };
}

vi.mock("@/auth", () => ({ signOut: mocks.signOut }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureOriginalUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/adminImpersonation", () => ({
  getActiveAdminImpersonation: vi.fn(async () => mocks.impersonation),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => mocks.sessionFailure),
}));
vi.mock("@/lib/server/guildAffiliation", () => ({
  clearAffiliationInTx: mocks.clearAffiliation,
}));
vi.mock("@/lib/server/storageDeletionQueue", () => ({
  processStorageDeletionQueue: mocks.processStorageQueue,
}));
vi.mock("@/lib/server/opsAlert", () => ({
  sendOpsAlert: mocks.sendOpsAlert,
}));
vi.mock("@/lib/server/referrals", () => ({
  preserveReferralBeforeUserDeletion: mocks.preserveReferral,
}));
vi.mock("@/lib/server/tradeSuspensionCleanup", () => ({
  lockActiveTradeExposure: mocks.lockActiveTradeExposure,
}));
vi.mock("@/db", () => {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(mocks.transactionRows.shift() ?? [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: Row | Row[]) => {
        if (!Array.isArray(values)) {
          mocks.inboxRows.push(values);
          return Promise.resolve();
        }
        mocks.queuedTargets = values;
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => mocks.queuedRows),
          })),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Row) => ({
        where: vi.fn(async () => {
          mocks.updates.push(values);
        }),
      })),
    })),
    delete: vi.fn(() => ({ where: mocks.deleteUser })),
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => mocks.userRows),
          })),
        })),
      })),
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
});

import { POST } from "./route";

function request(confirm: unknown = "용사") {
  return new Request("http://test/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.impersonation = null;
    mocks.sessionFailure = null;
    mocks.userRows = [{ gameName: "용사" }];
    mocks.transactionRows.length = 0;
    mocks.queuedTargets = [];
    mocks.queuedRows = [];
    mocks.inboxRows = [];
    mocks.updates = [];
    mocks.processStorageQueue.mockResolvedValue({
      attempted: 0,
      completed: 0,
      failed: 0,
      objectsDeleted: 0,
    });
  });

  it("관리자 가장 중에는 원래 관리자 계정 삭제를 막는다", async () => {
    mocks.impersonation = { targetUserId: "target" };
    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "impersonation_active",
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("인증·활성 기기·닉네임 확인을 모두 요구한다", async () => {
    mocks.userId = null;
    await expect(POST(request())).resolves.toMatchObject({ status: 401 });

    mocks.userId = "user-1";
    mocks.sessionFailure = new Response("gone", { status: 410 });
    await expect(POST(request())).resolves.toMatchObject({ status: 410 });

    mocks.sessionFailure = null;
    await expect(POST(request("다른 이름"))).resolves.toMatchObject({
      status: 400,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("일반 사용자를 삭제한 응답에서 서버 세션도 만료한다", async () => {
    mocks.transactionRows.push([]);
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.preserveReferral).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(mocks.lockActiveTradeExposure).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.any(Date),
      { includeHistoricalReferences: true },
    );
    expect(
      mocks.lockActiveTradeExposure.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.deleteUser.mock.invocationCallOrder[0]);
  });

  it("길드 마스터 삭제 전 남는 멤버의 소속 표기를 정리한다", async () => {
    mocks.transactionRows.push(
      [{ guildId: 7, role: "master" }],
      [{ userId: "user-1" }, { userId: "member-2" }, { userId: "member-3" }],
    );
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.clearAffiliation).toHaveBeenCalledTimes(2);
    expect(mocks.clearAffiliation).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "member-2",
    );
    expect(mocks.clearAffiliation).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "member-3",
    );
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
  });

  it("프로필 prefix·문의 이미지·해체되는 길드를 삭제 큐에 넣고 즉시 처리한다", async () => {
    mocks.userId = "123e4567-e89b-42d3-a456-426614174000";
    const feedbackKey =
      "feedback-images/123e4567-e89b-42d3-a456-426614174001.webp";
    mocks.transactionRows.push(
      [{ guildId: 7, role: "master" }],
      [{ userId: mocks.userId }],
      [{ id: 7 }],
      [{ imageKey: feedbackKey }, { imageKey: "invalid.webp" }],
    );
    mocks.queuedRows = [{ id: 11 }, { id: 12 }, { id: 13 }];

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.queuedTargets).toEqual([
      { kind: "profile_user", target: mocks.userId },
      { kind: "guild", target: "7" },
      { kind: "feedback_image", target: feedbackKey },
    ]);
    expect(mocks.processStorageQueue).toHaveBeenCalledWith({
      ids: [11, 12, 13],
    });
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
  });

  it("이미 유예 종료로 환불된 활성 매물의 옛 최고 입찰자에게 탈퇴 환불을 중복 생성하지 않는다", async () => {
    mocks.lockActiveTradeExposure.mockResolvedValueOnce({
      participantUserIds: ["seller-2", "user-1"],
      listings: [
        {
          id: 71,
          sellerId: "seller-2",
          sellerName: "판매자",
          kind: "material",
          itemId: "iron_ore",
          highestBidderId: "user-1",
          highestBid: 7_000,
          itemName: "철광석",
          quantity: 1,
          price: 8_000,
          instancePayload: null,
          status: "active",
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          bidEndsAt: new Date("2026-08-20T11:00:00.000Z"),
          expiresAt: new Date("2026-08-21T10:00:00.000Z"),
          bidCount: 2,
          bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
          closedAt: null,
          buyerId: null,
        },
      ],
      buyOrders: [],
    });
    mocks.transactionRows.push([], [], []);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.inboxRows.filter((row) => row.kind === "bid_refund")).toHaveLength(0);
    expect(mocks.updates).toContainEqual({
      highestBid: null,
      highestBidderId: null,
    });
  });

  it("종료된 경매의 최고 입찰자 참조도 유저 삭제 전에 잠그고 정리한다", async () => {
    mocks.lockActiveTradeExposure.mockResolvedValueOnce({
      participantUserIds: ["seller-2", "user-1"],
      listings: [
        {
          id: 72,
          sellerId: "seller-2",
          sellerName: "판매자",
          kind: "material",
          itemId: "iron_ore",
          highestBidderId: "user-1",
          highestBid: 8_000,
          itemName: "철광석",
          quantity: 1,
          price: 8_000,
          instancePayload: null,
          status: "sold",
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          bidEndsAt: new Date("2026-08-20T11:00:00.000Z"),
          expiresAt: new Date("2026-08-21T10:00:00.000Z"),
          bidCount: 2,
          bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
          closedAt: new Date("2026-08-20T11:05:00.000Z"),
          buyerId: "user-1",
        },
      ],
      buyOrders: [],
    });
    mocks.transactionRows.push([], [], []);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.inboxRows.filter((row) => row.kind === "bid_refund")).toHaveLength(0);
    expect(mocks.updates).toContainEqual({
      highestBid: null,
      highestBidderId: null,
    });
  });
});
