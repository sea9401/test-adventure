import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-material-sell"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));

import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import { POST } from "./route";

const MATERIAL_ID = Object.keys(V2_MATERIALS)[0] as V2MaterialId;

beforeEach(() => {
  vi.clearAllMocks();
  V2_MATERIAL_SELL_PRICE[MATERIAL_ID] = 7;
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    gold: 100,
    bankedGold: 200,
    materials: { [MATERIAL_ID]: 3 },
  });
});

afterEach(() => {
  delete V2_MATERIAL_SELL_PRICE[MATERIAL_ID];
});

describe("POST /api/v2/shop/material/sell", () => {
  it("재료 판매 대금을 소지금이 아닌 은행에 적립한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/v2/shop/material/sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: MATERIAL_ID, amount: 2 }),
      }),
    );
    const json = (await response.json()) as {
      gold: number;
      bankedGold: number;
      materials: Record<string, number>;
      sold: { count: number; gold: number };
    };

    expect(response.status).toBe(200);
    expect(json.sold).toEqual({ id: MATERIAL_ID, count: 2, gold: 14 });
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(214);
    expect(json.materials[MATERIAL_ID]).toBe(1);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100,
      bankedGold: 214,
    });
  });
});
