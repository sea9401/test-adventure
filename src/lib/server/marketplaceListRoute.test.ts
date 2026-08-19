import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertValues, store, upsertSave, requireTradeParticipants, TradeSuspendedError } = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  const store = new Map<string, unknown>();
  return {
    TradeSuspendedError,
    insertValues: [] as unknown[],
    store,
    upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
      store.set(key, value);
    }),
    requireTradeParticipants: vi.fn(async () => undefined),
  };
});

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
  upsertSave,
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError,
  requireTradeParticipants,
  tradeSuspendedResponse: () =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
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

function listSpecimenRequest(quantity: number): Request {
  return new Request("http://test/api/v2/marketplace/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "consumable",
      itemId: "fish_specimen_carp",
      quantity,
      price: 10_000,
      graceHours: 2,
    }),
  });
}

function listDangerousCatchRequest(quantity: number): Request {
  return new Request("http://test/api/v2/marketplace/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "material",
      itemId: "danger_catch_ironjaw_tuna",
      quantity,
      price: 12_000,
      graceHours: 2,
    }),
  });
}

describe("거래소 레어맵 등록", () => {
  beforeEach(() => {
    insertValues.length = 0;
    store.clear();
    vi.clearAllMocks();
  });

  it("거래 정지 판매자는 표본 매물을 등록하지 못하고 에스크로를 건드리지 않는다", async () => {
    store.set("character.v2", {});
    store.set("fishing-specimens.v1", { version: 1, items: { carp: 3 } });
    requireTradeParticipants.mockRejectedValueOnce(new TradeSuspendedError());

    const response = await POST(listSpecimenRequest(2));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "trade_suspended" });
    expect(upsertSave).not.toHaveBeenCalled();
    expect(insertValues).toHaveLength(0);
    expect(store.get("fishing-specimens.v1")).toEqual({
      version: 1,
      items: { carp: 3 },
    });
  });

  it.each([
    ["비밀 상점 지도", "secret_shop_map"],
    ["개명 신전 지도", "rename_map"],
  ] as const)("%s는 등록하지 않는다", async (_name, kind) => {
    const map = {
      iid: `non-tradable-${kind}`,
      kind,
      depth: 12,
      runsLeft: 1,
      foundAt: Date.now(),
    };
    store.set("character.v2", { rareMaps: [map] });

    const response = await POST(listRareMapRequest(map.iid));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "not_tradable",
    });
    expect(store.get("character.v2")).toEqual({ rareMaps: [map] });
    expect(insertValues).toHaveLength(0);
  });

  it("다른 레어 지도는 기존처럼 등록한다", async () => {
    const map = {
      iid: "tradable-worn-map",
      kind: "worn_map" as const,
      depth: 12,
      runsLeft: 3,
      foundAt: Date.now(),
    };
    store.set("character.v2", { rareMaps: [map] });

    const response = await POST(listRareMapRequest(map.iid));

    expect(response.status).toBe(200);
    expect(store.get("character.v2")).toEqual({ rareMaps: [] });
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        kind: "consumable",
        itemId: "worn_map",
        quantity: 1,
      }),
    );
  });

  it("보유한 어종 표본을 수량만큼 에스크로로 옮긴다", async () => {
    store.set("character.v2", {});
    store.set("fishing-specimens.v1", { version: 1, items: { carp: 3 } });

    const response = await POST(listSpecimenRequest(2));

    expect(response.status).toBe(200);
    expect(store.get("fishing-specimens.v1")).toEqual({
      version: 1,
      items: { carp: 1 },
    });
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        kind: "consumable",
        itemId: "fish_specimen_carp",
        itemName: "잉어 표본",
        quantity: 2,
      }),
    );
  });

  it("보유량보다 많은 어종 표본은 등록하지 않는다", async () => {
    store.set("character.v2", {});
    store.set("fishing-specimens.v1", { version: 1, items: { carp: 1 } });

    const response = await POST(listSpecimenRequest(2));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "not_owned" });
    expect(store.get("fishing-specimens.v1")).toEqual({
      version: 1,
      items: { carp: 1 },
    });
  });

  it("귀환한 위험 해역 어획물을 수량만큼 에스크로로 옮긴다", async () => {
    store.set("character.v2", {
      materials: { danger_catch_ironjaw_tuna: 5, v2_iron_ore: 2 },
    });

    const response = await POST(listDangerousCatchRequest(3));

    expect(response.status).toBe(200);
    expect(store.get("character.v2")).toEqual({
      materials: { danger_catch_ironjaw_tuna: 2, v2_iron_ore: 2 },
    });
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        kind: "material",
        itemId: "danger_catch_ironjaw_tuna",
        itemName: "철턱 참치",
        quantity: 3,
      }),
    );
  });
});
