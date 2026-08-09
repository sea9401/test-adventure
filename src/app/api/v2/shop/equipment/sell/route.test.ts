import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-single-sell"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
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

import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { POST } from "./route";

const BOW = "v2_starsong_bow" as V2EquipmentId;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", { gold: 100, bankedGold: 200 });
  mocks.saves.set("equipment.v2", {
    owned: [{ iid: "sell-me", id: BOW }],
    equipped: {},
  });
});

describe("POST /api/v2/shop/equipment/sell", () => {
  it("장비 판매 대금을 소지금이 아닌 은행에 적립한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/v2/shop/equipment/sell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iid: "sell-me" }),
      }),
    );
    const json = (await response.json()) as {
      gold: number;
      bankedGold: number;
      sellPrice: number;
      owned: unknown[];
    };

    expect(response.status).toBe(200);
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(200 + json.sellPrice);
    expect(json.owned).toEqual([]);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100,
      bankedGold: 200 + json.sellPrice,
    });
  });
});
