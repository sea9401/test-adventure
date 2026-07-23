import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  impersonation: null as { targetUserId: string } | null,
  sessionFailure: null as Response | null,
  userRows: [] as Row[],
  transactionRows: [] as Row[][],
  deleteUser: vi.fn(async () => undefined),
  clearAffiliation: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

function queryResult(rows: Row[]) {
  const promise = Promise.resolve(rows);
  return {
    limit: vi.fn(async () => rows),
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
vi.mock("@/db", () => {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(mocks.transactionRows.shift() ?? [])),
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
    expect(mocks.deleteUser).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
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
});
