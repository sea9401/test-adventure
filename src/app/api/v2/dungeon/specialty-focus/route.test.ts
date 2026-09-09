import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "specialty-user" as string | null,
  character: {
    frontierDepth: 79,
    gold: 123,
    unrelated: { preserved: true },
  } as Record<string, unknown>,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => mocks.character),
  lockSaveForUpdate: vi.fn(async () => mocks.character),
  upsertSave: vi.fn(async (_tx, _userId, _key, value) => {
    mocks.character = value as Record<string, unknown>;
  }),
}));

import { upsertSave } from "@/lib/server/savesKv";
import { GET, POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/v2/dungeon/specialty-focus", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "specialty-user";
  mocks.character = {
    frontierDepth: 79,
    gold: 123,
    unrelated: { preserved: true },
  };
});

describe("미개척지 특화 집중 API", () => {
  it("해금 깊이와 정규화된 현재 모드를 조회한다", async () => {
    mocks.character = { frontierDepth: 79, unexploredHuntMode: { mode: "bad" } };

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      unlocked: true,
      mode: { mode: "standard" },
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("79 깊이부터 집중 풀을 저장하고 기존 캐릭터 필드를 보존한다", async () => {
    const response = await POST(postRequest({
      mode: "focused",
      poolId: "venom_colony",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mode: { mode: "focused", poolId: "venom_colony" },
    });
    expect(mocks.character).toEqual({
      frontierDepth: 79,
      gold: 123,
      unrelated: { preserved: true },
      unexploredHuntMode: { mode: "focused", poolId: "venom_colony" },
    });
  });

  it("해금 전에는 집중 설정을 저장하지 않는다", async () => {
    mocks.character = { frontierDepth: 78 };

    const response = await POST(postRequest({ mode: "random" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "specialty_locked",
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("존재하지 않는 집중 풀은 저장하지 않는다", async () => {
    const response = await POST(postRequest({
      mode: "focused",
      poolId: "missing_pool",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_specialty_pool",
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("인증되지 않은 요청을 거부한다", async () => {
    mocks.userId = null;

    expect((await GET()).status).toBe(401);
    expect((await POST(postRequest({ mode: "standard" }))).status).toBe(401);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
