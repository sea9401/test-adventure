import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "u-test" as string | null,
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_db, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
}));

import { GET } from "./route";

describe("GET /api/v2/me/fishing-specimens", () => {
  beforeEach(() => {
    mocks.userId = "u-test";
    mocks.store.clear();
    mocks.store.set("fishing-codex.v1", {
      fish: {
        carp: { registered: true, caughtEver: false },
        trout: { registered: false, caughtEver: true, bestSize: 55, totalCaught: 2 },
      },
    });
    mocks.store.set("fishing-specimens.v1", { items: { carp: 2, fake: 99 } });
  });

  it("표본 수량과 현재 등록된 어종을 반환한다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      specimens: { carp: 2 },
      registeredIds: ["carp"],
    });
  });

  it("로그인하지 않은 요청은 거부한다", async () => {
    mocks.userId = null;
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
