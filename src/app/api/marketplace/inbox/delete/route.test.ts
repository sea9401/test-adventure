import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

type InboxRow = {
  id: number;
  userId: string;
  claimedAt: Date | null;
  recipientDeletedAt: Date | null;
};

const mocks = vi.hoisted(() => ({
  userId: "u1" as string | null,
  inboxRows: [] as InboxRow[],
  selectWhere: [] as unknown[],
  updates: [] as Array<{ values: Record<string, unknown>; where: unknown }>,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));

vi.mock("@/db", () => {
  const selectChain: Record<string, unknown> = {};
  selectChain.from = () => selectChain;
  selectChain.where = (condition: unknown) => {
    mocks.selectWhere.push(condition);
    return selectChain;
  };
  selectChain.for = () => selectChain;
  selectChain.then = (
    resolve: (value: InboxRow[]) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(mocks.inboxRows).then(resolve, reject);

  const tx = {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition: unknown) => {
          mocks.updates.push({ values, where: condition });
        },
      }),
    }),
  };

  return {
    db: {
      transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    },
  };
});

async function post(request: Request): Promise<Response> {
  const route = await import("./route").catch(() => null);
  expect(route, "delete Route Handler가 구현되어야 합니다").not.toBeNull();
  return route!.POST(request);
}

function request(id: unknown = 1): Request {
  return new Request("http://t/api/marketplace/inbox/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-04T09:30:00.000Z"));
  mocks.userId = "u1";
  mocks.inboxRows.length = 0;
  mocks.selectWhere.length = 0;
  mocks.updates.length = 0;
});

describe("POST /api/marketplace/inbox/delete", () => {
  it("로그인하지 않은 요청을 거부한다", async () => {
    mocks.userId = null;

    const response = await post(request());

    expect(response.status).toBe(401);
    expect(mocks.selectWhere).toHaveLength(0);
  });

  it("잘못된 JSON과 양의 정수가 아닌 ID를 거부한다", async () => {
    const invalidJson = new Request("http://t/api/marketplace/inbox/delete", {
      method: "POST",
      body: "{",
    });

    expect((await post(invalidJson)).status).toBe(400);
    expect((await post(request(0))).status).toBe(400);
    expect((await post(request("1"))).status).toBe(400);
    expect((await post(request(1.5))).status).toBe(400);
  });

  it("존재하지 않거나 소유하지 않은 우편을 찾을 수 없음으로 처리한다", async () => {
    const response = await post(request(99));

    expect(response.status).toBe(404);
    expect(mocks.updates).toHaveLength(0);
  });

  it("미수령·미처리 우편은 삭제하지 않는다", async () => {
    mocks.inboxRows.push({
      id: 1,
      userId: "u1",
      claimedAt: null,
      recipientDeletedAt: null,
    });

    const response = await post(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "not_completed",
    });
    expect(mocks.updates).toHaveLength(0);
  });

  it("완료된 본인 우편에 수신자 삭제 시각을 기록한다", async () => {
    mocks.inboxRows.push({
      id: 7,
      userId: "u1",
      claimedAt: new Date("2026-09-04T09:00:00.000Z"),
      recipientDeletedAt: null,
    });

    const response = await post(request(7));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedAt: "2026-09-04T09:30:00.000Z",
    });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].values).toEqual({
      recipientDeletedAt: new Date("2026-09-04T09:30:00.000Z"),
    });

    const target = new PgDialect().sqlToQuery(
      mocks.selectWhere[0] as SQL,
    );
    expect(target.sql).toContain('"marketplace_inbox"."id" = $1');
    expect(target.sql).toContain('"marketplace_inbox"."user_id" = $2');
    expect(target.params).toEqual([7, "u1"]);

    const updateTarget = new PgDialect().sqlToQuery(
      mocks.updates[0].where as SQL,
    );
    expect(updateTarget.sql).toContain('"marketplace_inbox"."id" = $1');
    expect(updateTarget.sql).toContain('"marketplace_inbox"."user_id" = $2');
    expect(updateTarget.sql).toContain(
      '"marketplace_inbox"."recipient_deleted_at" is null',
    );
    expect(updateTarget.params).toEqual([7, "u1"]);
  });

  it("이미 삭제한 우편은 기존 시각으로 멱등 성공한다", async () => {
    mocks.inboxRows.push({
      id: 1,
      userId: "u1",
      claimedAt: new Date("2026-09-04T09:00:00.000Z"),
      recipientDeletedAt: new Date("2026-09-04T09:10:00.000Z"),
    });

    const response = await post(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deletedAt: "2026-09-04T09:10:00.000Z",
    });
    expect(mocks.updates).toHaveLength(0);
  });
});
