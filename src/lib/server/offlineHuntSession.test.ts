import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, HUNT_COOLDOWN_MODE: true };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/offline-hunt/route";

function request(body: Record<string, unknown>) {
  return new Request("http://test/api/v2/me/offline-hunt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/me/offline-hunt", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", { level: 30 });
  });

  it("시작 시 정지 조건을 정규화해 세션과 함께 저장한다", async () => {
    const response = await POST(
      request({
        action: "start",
        autoStopConfig: {
          potionEnabled: true,
          potionThreshold: 77.9,
          rareMapEnabled: true,
          level100Enabled: true,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(store.get("character.v2")).toMatchObject({
      offlineHuntStopConfig: {
        potionEnabled: true,
        potionThreshold: 77,
        rareMapEnabled: true,
        level100Enabled: true,
      },
    });
  });

  it("명시 정지 시 세션과 정지 조건을 함께 제거한다", async () => {
    store.set("character.v2", {
      level: 30,
      offlineHuntStartedAt: Date.now() - 1_000,
      offlineHuntStopConfig: { rareMapEnabled: true },
    });
    const response = await POST(request({ action: "stop" }));
    expect(response.status).toBe(200);
    expect(store.get("character.v2")).toMatchObject({
      offlineHuntStartedAt: null,
      offlineHuntStopConfig: null,
    });
  });
});
