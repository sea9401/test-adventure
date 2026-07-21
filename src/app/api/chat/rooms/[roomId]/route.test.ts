import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    deletes: [] as unknown[],
  };

  const query = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit", "for"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      resolve: (value: unknown[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return builder;
  };

  const tx = {
    select: vi.fn(() => query(state.selectRows.shift() ?? [])),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        state.updates.push({ table, values });
        return { where: vi.fn(async () => undefined) };
      }),
    })),
    delete: vi.fn((table: unknown) => {
      state.deletes.push(table);
      return { where: vi.fn(async () => undefined) };
    }),
  };

  return {
    state,
    tx,
    ensureUser: vi.fn(async () => "u-leaving" as string | null),
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(
      async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
    ),
  },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));

import { chatRoomMembers, chatRooms } from "@/db/schema";
import { POST } from "./route";

function leaveRequest() {
  return new Request("http://localhost/api/chat/rooms/7", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "leave" }),
  });
}

function leave() {
  return POST(leaveRequest(), { params: Promise.resolve({ roomId: "7" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.selectRows = [];
  mocks.state.updates = [];
  mocks.state.deletes = [];
  mocks.ensureUser.mockResolvedValue("u-leaving");
});

describe("POST /api/chat/rooms/[roomId] leave", () => {
  it("일반 참여자는 자신의 멤버십만 삭제한다", async () => {
    mocks.state.selectRows = [
      [{ ownerId: "u-owner" }],
      [{ userId: "u-leaving" }],
    ];

    const response = await leave();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.state.updates).toEqual([]);
    expect(mocks.state.deletes).toEqual([chatRoomMembers]);
  });

  it("방장이 나가면 가장 먼저 참여한 멤버에게 방장을 넘긴다", async () => {
    mocks.state.selectRows = [
      [{ ownerId: "u-leaving" }],
      [{ userId: "u-leaving" }],
      [{ userId: "u-successor" }],
    ];

    const response = await leave();

    expect(response.status).toBe(200);
    expect(mocks.state.updates).toHaveLength(2);
    expect(mocks.state.updates[0]).toEqual({
      table: chatRooms,
      values: { ownerId: "u-successor", updatedAt: expect.any(Date) },
    });
    expect(mocks.state.updates[1]).toEqual({
      table: chatRoomMembers,
      values: { role: "owner" },
    });
    expect(mocks.state.deletes).toEqual([chatRoomMembers]);
  });

  it("혼자 남은 방장이 나가면 채팅방을 삭제한다", async () => {
    mocks.state.selectRows = [
      [{ ownerId: "u-leaving" }],
      [{ userId: "u-leaving" }],
      [],
    ];

    const response = await leave();

    expect(response.status).toBe(200);
    expect(mocks.state.updates).toEqual([]);
    expect(mocks.state.deletes).toEqual([chatRooms]);
  });
});
