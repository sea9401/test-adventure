import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  return {
    TradeSuspendedError,
    senderId: "u-sender",
    recipientId: "u-recipient",
    suspendedUserId: null as string | null,
    craft: {
      known: ["starlit_greatsword_str"],
      shareable: ["starlit_greatsword_str"],
    },
    inboxInsert: vi.fn(async () => undefined),
    rootInsert: vi.fn(async () => undefined),
    upsertSave: vi.fn(async () => undefined),
    requireTradeParticipants: vi.fn(
      async (_tx: unknown, userIds: readonly string[]) => {
        if (
          mocks.suspendedUserId &&
          userIds.includes(mocks.suspendedUserId)
        ) {
          throw new TradeSuspendedError();
        }
      },
    ),
  };
});

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    for: vi.fn(() => chain),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const tx = {
  select: vi.fn((fields?: Record<string, unknown>) => {
    if (!fields) return selectChain([{ value: mocks.craft }]);
    if ("createdAt" in fields) return selectChain([]);
    if ("value" in fields) return selectChain([{ value: 0 }]);
    return selectChain([]);
  }),
  insert: vi.fn(() => ({ values: mocks.inboxInsert })),
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "id" in fields && "name" in fields) {
        return selectChain([
          { id: mocks.recipientId, name: "Recipient" },
        ]);
      }
      if (fields && "name" in fields) {
        return selectChain([{ name: "Sender" }]);
      }
      if (fields && "createdAt" in fields) return selectChain([]);
      if (fields && "value" in fields) return selectChain([{ value: 0 }]);
      return selectChain([]);
    }),
    insert: vi.fn(() => ({ values: mocks.rootInsert })),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.senderId),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => null),
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  usersCannotInteract: vi.fn(async () => false),
  requireCurrentUgcConsent: vi.fn(async () => null),
}));
vi.mock("@/lib/server/marketplace", () => ({
  getRecipeDef: vi.fn((id: string) =>
    id === "starlit_greatsword_str"
      ? { name: "힘의 별빛 대검 제작서", tradable: true }
      : undefined,
  ),
  getKnownArr: vi.fn((value: { known?: string[] }) => value.known ?? []),
  getShareableArr: vi.fn(
    (value: { shareable?: string[] }) => value.shareable ?? [],
  ),
}));
vi.mock("@/lib/server/savesKv", () => ({
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: mocks.TradeSuspendedError,
  requireTradeParticipants: mocks.requireTradeParticipants,
  tradeSuspendedResponse: () =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
}));

import { POST } from "./route";

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/inbox/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.suspendedUserId = null;
  mocks.craft = {
    known: ["starlit_greatsword_str"],
    shareable: ["starlit_greatsword_str"],
  };
});

describe("유저 우편 거래 정지 경계", () => {
  it("거래 정지 발신자의 쪽지를 차단하고 우편을 만들지 않는다", async () => {
    mocks.suspendedUserId = mocks.senderId;

    const response = await POST(
      request({ recipientName: "Recipient", text: "안녕하세요" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "trade_suspended",
    });
    expect(mocks.requireTradeParticipants).toHaveBeenCalledWith(
      tx,
      [mocks.senderId, mocks.recipientId],
      expect.any(Date),
    );
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.inboxInsert).not.toHaveBeenCalled();
    expect(mocks.rootInsert).not.toHaveBeenCalled();
  });

  it("거래 정지 수신자에게 보내는 제작서 선물을 토큰 소비 전에 차단한다", async () => {
    mocks.suspendedUserId = mocks.recipientId;

    const response = await POST(
      request({
        recipientName: "Recipient",
        text: "선물입니다",
        attachedRecipeId: "starlit_greatsword_str",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "trade_suspended",
    });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.inboxInsert).not.toHaveBeenCalled();
  });

  it("제한 없는 쪽지는 참가자를 먼저 잠근 같은 트랜잭션에서 발송한다", async () => {
    const response = await POST(
      request({ recipientName: "Recipient", text: "안녕하세요" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.inboxInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mocks.recipientId,
        kind: "user_message",
        fromUserId: mocks.senderId,
      }),
    );
    expect(mocks.rootInsert).not.toHaveBeenCalled();
    expect(
      mocks.requireTradeParticipants.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.inboxInsert.mock.invocationCallOrder[0]);
  });

  it("제한 없는 제작서 선물은 참가자를 먼저 잠근 뒤 토큰과 우편을 함께 옮긴다", async () => {
    const response = await POST(
      request({
        recipientName: "Recipient",
        text: "선물입니다",
        attachedRecipeId: "starlit_greatsword_str",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      tx,
      mocks.senderId,
      "crafting.v2",
      {
        known: ["starlit_greatsword_str"],
        shareable: [],
      },
    );
    expect(mocks.inboxInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mocks.recipientId,
        kind: "recipe_gift",
        fromUserId: mocks.senderId,
      }),
    );
    expect(
      mocks.requireTradeParticipants.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.upsertSave.mock.invocationCallOrder[0]);
    expect(
      mocks.requireTradeParticipants.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.inboxInsert.mock.invocationCallOrder[0]);
  });
});
