import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  conditions: [] as unknown[],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u1"),
}));

vi.mock("@/db", () => {
  const chain = (rows: unknown[]) => {
    const query: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "orderBy", "limit"]) {
      query[method] = () => query;
    }
    query.where = (condition: unknown) => {
      mocks.conditions.push(condition);
      return query;
    };
    query.then = (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return query;
  };

  return {
    db: {
      select: (projection: Record<string, unknown>) =>
        Object.keys(projection).length === 1 && "one" in projection
          ? chain([])
          : chain(mocks.results.shift() ?? []),
    },
  };
});

import { GET } from "./route";

const pendingMessage = {
  id: 1,
  kind: "user_message",
  payload: { text: "안 읽은 쪽지" },
  message: null,
  listingId: null,
  fromName: "모험가",
  fromUserId: "u2",
  recipientName: null,
  createdAt: new Date("2026-08-12T01:00:00.000Z"),
  readAt: null,
  claimedAt: null,
};

const pendingReward = {
  id: 2,
  kind: "admin_gift",
  payload: { gold: 500 },
  message: "선물",
  listingId: null,
  fromName: null,
  fromUserId: null,
  recipientName: null,
  createdAt: new Date("2026-08-12T02:00:00.000Z"),
  readAt: new Date("2026-08-12T02:01:00.000Z"),
  claimedAt: null,
};

const completedMessage = {
  ...pendingMessage,
  id: 3,
  payload: { text: "확인한 쪽지" },
  createdAt: new Date("2026-08-12T03:00:00.000Z"),
  readAt: new Date("2026-08-12T03:01:00.000Z"),
  claimedAt: new Date("2026-08-12T03:01:00.000Z"),
};

beforeEach(() => {
  mocks.results.length = 0;
  mocks.conditions.length = 0;
});

function compiledConditions(): string[] {
  const dialect = new PgDialect();
  return mocks.conditions.map(
    (condition) => dialect.sqlToQuery(condition as SQL).sql,
  );
}

describe("GET /api/marketplace/inbox", () => {
  it("미완료와 최근 완료 우편을 하나의 받은 우편 목록으로 최신순 반환한다", async () => {
    mocks.results.push([pendingMessage, pendingReward], [completedMessage]);

    const response = await GET(new Request("http://t/api/marketplace/inbox"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items.map((item: { id: number }) => item.id)).toEqual([3, 2, 1]);
    expect(json.unreadCount).toBe(1);
    expect(json.items[0]).toMatchObject({
      readAt: "2026-08-12T03:01:00.000Z",
      claimState: "none",
      hasReward: false,
    });
    expect(json.items[1]).toMatchObject({
      claimedAt: null,
      claimState: "claimable",
      hasReward: true,
    });
    expect(
      compiledConditions().filter((sql) =>
        sql.includes('"marketplace_inbox"."recipient_deleted_at" is null'),
      ),
    ).toHaveLength(2);
  });

  it("미확인 개수에서도 수신자가 삭제한 우편을 제외한다", async () => {
    const response = await GET(
      new Request("http://t/api/marketplace/inbox?count=1"),
    );

    expect(response.status).toBe(200);
    expect(compiledConditions()).toContainEqual(
      expect.stringContaining(
        '"marketplace_inbox"."recipient_deleted_at" is null',
      ),
    );
  });

  it("수신자의 삭제 여부와 무관하게 발신자의 보낸 우편 기록을 유지한다", async () => {
    mocks.results.push([]);

    const response = await GET(
      new Request("http://t/api/marketplace/inbox?sent=1"),
    );

    expect(response.status).toBe(200);
    expect(compiledConditions()).not.toContainEqual(
      expect.stringContaining("recipient_deleted_at"),
    );
  });

  it("손상된 우편은 자동 수령할 수 없는 invalid 상태로 노출한다", async () => {
    mocks.results.push(
      [
        {
          ...pendingReward,
          id: 4,
          kind: "season_reward",
          payload: { season: "broken", coins: 100 },
          readAt: null,
        },
      ],
      [],
    );

    const response = await GET(new Request("http://t/api/marketplace/inbox"));
    const json = await response.json();

    expect(json.items[0]).toMatchObject({
      id: 4,
      claimState: "invalid",
      hasReward: false,
    });
    expect(json.unreadCount).toBe(1);
  });
});
