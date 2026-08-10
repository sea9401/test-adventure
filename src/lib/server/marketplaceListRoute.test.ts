import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertValues, store } = vi.hoisted(() => ({
  insertValues: [] as unknown[],
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "seller-test"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => {
  const selectChain = {
    from: () => selectChain,
    where: async () => [{ c: 0 }],
  };
  const tx = {
    select: () => selectChain,
    insert: () => ({
      values: (value: unknown) => {
        insertValues.push(value);
        return { returning: async () => [{ id: 1 }] };
      },
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (callback: (executor: unknown) => unknown) =>
        callback(tx),
      ),
    },
  };
});

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/marketplaceV2", async (importActual) => {
  const actual = await importActual<typeof import("./marketplaceV2")>();
  return {
    ...actual,
    resolvePlayerName: vi.fn(async () => "판매자"),
  };
});

import { POST } from "@/app/api/v2/marketplace/list/route";

function listRareMapRequest(iid: string): Request {
  return new Request("http://test/api/v2/marketplace/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "consumable",
      iid,
      price: 10_000,
      graceHours: 2,
    }),
  });
}

describe("거래소 레어맵 등록", () => {
  beforeEach(() => {
    insertValues.length = 0;
    store.clear();
  });

  it("품목을 하나라도 구매한 비밀상점 지도는 등록하지 않는다", async () => {
    const map = {
      iid: "secret-shop-used",
      kind: "secret_shop_map",
      depth: 12,
      runsLeft: 1,
      foundAt: Date.now(),
      bought: ["stone_red"],
    };
    store.set("character.v2", { rareMaps: [map] });

    const response = await POST(listRareMapRequest(map.iid));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "secret_shop_used",
    });
    expect(store.get("character.v2")).toEqual({ rareMaps: [map] });
    expect(insertValues).toHaveLength(0);
  });
});
