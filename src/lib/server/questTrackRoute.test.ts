import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    ),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/v2QuestContext", () => ({
  GUIDE_QUESTS_KEY: "guide-quests.v2",
  parseClaimed: vi.fn((raw: { claimed?: unknown } | undefined) =>
    new Set(Array.isArray(raw?.claimed) ? raw.claimed : []),
  ),
  guideQuestSavePayload: vi.fn(
    (claimed: ReadonlySet<string>, trackedQuestId: string | null) =>
      trackedQuestId
        ? { claimed: [...claimed], trackedQuestId }
        : { claimed: [...claimed] },
  ),
}));

import { POST } from "@/app/api/v2/me/quests/track/route";

function trackReq(questId: unknown): Request {
  return new Request("http://t/api/v2/me/quests/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questId }),
  });
}

describe("POST /api/v2/me/quests/track", () => {
  beforeEach(() => {
    store.clear();
    store.set("guide-quests.v2", { claimed: [] });
  });

  it("업적 하나를 추적하고 null 요청으로 해제한다", async () => {
    const tracked = await POST(trackReq("x_rich"));
    expect(tracked.status).toBe(200);
    await expect(tracked.json()).resolves.toEqual({
      ok: true,
      trackedQuestId: "x_rich",
    });
    expect(store.get("guide-quests.v2")).toEqual({
      claimed: [],
      trackedQuestId: "x_rich",
    });

    const cleared = await POST(trackReq(null));
    expect(cleared.status).toBe(200);
    expect(store.get("guide-quests.v2")).toEqual({ claimed: [] });
  });

  it("튜토리얼과 이미 수령한 업적은 추적하지 않는다", async () => {
    expect((await POST(trackReq("g_first_job"))).status).toBe(400);

    store.set("guide-quests.v2", { claimed: ["x_rich"] });
    const completed = await POST(trackReq("x_rich"));
    expect(completed.status).toBe(409);
    await expect(completed.json()).resolves.toMatchObject({
      error: "already_completed",
    });
  });
});
