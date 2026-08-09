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
  ensureUser: vi.fn(async () => "u-bulk-sell"),
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

import { POST } from "./route";
import type { V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

const BOW = "v2_starsong_bow" as V2EquipmentId;

function request(belowPct: number) {
  return new Request("http://localhost/api/v2/shop/equipment/sell-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slot: "weapon", belowPct }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", { gold: 100, bankedGold: 200 });
  mocks.saves.set("equipment.v2", {
    owned: [
      {
        iid: "low",
        id: BOW,
        roll: { power: 27, weight: 0, options: { crit: 1 } },
      },
      {
        iid: "high",
        id: BOW,
        roll: { power: 129, weight: 0, options: { crit: 3 } },
      },
      { iid: "fixed", id: BOW },
      {
        iid: "locked-low",
        id: BOW,
        roll: { power: 27, weight: 0, options: { crit: 1 } },
        locked: true,
      },
    ],
    equipped: {},
  });
});

describe("POST /api/v2/shop/equipment/sell-bulk", () => {
  it("기준 품질 이하 장비만 판매하고 고품질·고정품질·잠금 장비는 보존한다", async () => {
    const response = await POST(request(40));
    const json = (await response.json()) as {
      soldCount: number;
      soldGold: number;
      owned: { iid: string }[];
      gold: number;
      bankedGold: number;
    };

    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(1);
    expect(json.soldGold).toBeGreaterThan(0);
    expect(json.owned.map((item) => item.iid)).toEqual([
      "high",
      "fixed",
      "locked-low",
    ]);
    expect(json.gold).toBe(100);
    expect(json.bankedGold).toBe(200 + json.soldGold);
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100,
      bankedGold: 200 + json.soldGold,
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledOnce();
  });

  it("100% 경계값도 이하 판매 대상에 포함한다", async () => {
    const response = await POST(request(100));
    const json = (await response.json()) as {
      soldCount: number;
      owned: { iid: string }[];
    };

    expect(response.status).toBe(200);
    expect(json.soldCount).toBe(2);
    expect(json.owned.map((item) => item.iid)).toEqual([
      "fixed",
      "locked-low",
    ]);
  });
});
