import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  deleteCalled: false,
  insertCalled: false,
  insertedValues: null as unknown,
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/checkSession", () => ({
  requireActiveDeviceSession: vi.fn(async () => null),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => {
      mocks.insertCalled = true;
      return {
        values: vi.fn((values: unknown) => {
          mocks.insertedValues = values;
          return { onConflictDoNothing: vi.fn(async () => undefined) };
        }),
      };
    }),
    delete: vi.fn(() => {
      mocks.deleteCalled = true;
      return { where: vi.fn(async () => undefined) };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => []) })),
    })),
  },
}));

import { DELETE, GET, PATCH } from "./route";

function patch(key: string): Request {
  return new Request(`http://test/api/save?key=${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: { gold: 999_999_999 } }),
  });
}

function remove(key?: string): Request {
  return new Request(
    `http://test/api/save${key ? `?key=${encodeURIComponent(key)}` : ""}`,
    { method: "DELETE" },
  );
}

describe("/api/save server authority boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.deleteCalled = false;
    mocks.insertCalled = false;
    mocks.insertedValues = null;
  });

  it.each(["character.v2", "inventory.v2", "crafting.v2", "quest-progress.v2"])(
    "클라이언트 PATCH로 권위 키 %s를 덮어쓰지 못한다",
    async (key) => {
      const response = await PATCH(patch(key));
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "server_authoritative_key",
      });
      expect(mocks.insertCalled).toBe(false);
    },
  );

  it("전체 세이브 및 권위 키 삭제를 거절한다", async () => {
    expect((await DELETE(remove())).status).toBe(400);
    expect((await DELETE(remove("character.v2"))).status).toBe(403);
    expect(mocks.deleteCalled).toBe(false);
  });

  it("GET bootstrap은 클라이언트 입력 없이 서버 초기값만 idempotent하게 시드한다", async () => {
    const response = await GET(new Request("http://test/api/save"));
    expect(response.status).toBe(200);
    expect(mocks.insertedValues).toEqual([
      expect.objectContaining({
        userId: "user-1",
        key: "character.v2",
        value: expect.objectContaining({ level: 1, gold: 50 }),
      }),
      expect.objectContaining({
        userId: "user-1",
        key: "inventory.v2",
        value: expect.objectContaining({ hpCharges: 100_000, mpCharges: 100_000 }),
      }),
    ]);
  });
});
