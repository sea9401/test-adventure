import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  character: null as Record<string, unknown> | null,
  inventory: {} as Record<string, unknown>,
  staminaPotions: { count: 0, boundCount: 0 },
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (fn: (tx: object) => unknown) => fn({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-secret-shop"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, _key: string, fallback: unknown) =>
      mocks.character ?? fallback,
  ),
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) => {
      if (key === "character.v2") return mocks.character ?? fallback;
      if (key === "inventory.v2") return mocks.inventory;
      if (key === "stamina-potions.v1") return mocks.staminaPotions;
      return fallback;
    },
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      if (key === "character.v2") {
        mocks.character = value as Record<string, unknown>;
      }
      if (key === "inventory.v2") {
        mocks.inventory = value as Record<string, unknown>;
      }
      if (key === "stamina-potions.v1") {
        mocks.staminaPotions = value as { count: number; boundCount: number };
      }
    },
  ),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

import { GET, POST } from "./route";
import {
  newRareMapInstance,
  RARE_MAP_TTL_MS,
} from "@/adventure/data/v2/rareMaps";
import { MAX_CHARGE } from "@/lib/v2-charge-config";

const NOW = 2_000_000;
const FOUND_AT = NOW - 5 * 60_000;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mocks.character = {
    gold: 123_456,
    rareMaps: [
      newRareMapInstance("secret_shop_map", 70, FOUND_AT, "rm-shop"),
    ],
  };
  mocks.staminaPotions = { count: 2, boundCount: 1 };
  mocks.inventory = { hpCharges: 123, mpCharges: 456, marker: "preserved" };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v2/secret-shop", () => {
  it("서버 기준 지도 만료 시각을 상점 응답에 포함한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/v2/secret-shop?map=rm-shop"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      map: "rm-shop",
      serverNow: NOW,
      expiresAt: FOUND_AT + RARE_MAP_TTL_MS,
    });
  });
});

describe("POST /api/v2/secret-shop", () => {
  it("HP 충전약 완충 구매 시 실제 충전량을 저장하고 응답한다", async () => {
    mocks.character = { ...mocks.character, gold: 3_000_000 };

    const response = await POST(
      new Request("http://localhost/api/v2/secret-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: "rm-shop", itemId: "hp_charge_pack" }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, hpCharges: MAX_CHARGE });
    expect(mocks.inventory).toEqual({
      hpCharges: MAX_CHARGE,
      mpCharges: 456,
      marker: "preserved",
    });
  });

  it("스태미나 회복약 구매 시 보관형 회복약 1개를 지급한다", async () => {
    const staminaBefore = { current: 500, lastUpdatedAt: NOW };
    mocks.character = { ...mocks.character, stamina: staminaBefore };

    const response = await POST(
      new Request("http://localhost/api/v2/secret-shop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: "rm-shop", itemId: "stamina_potion" }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, staminaPotions: 3 });
    expect(mocks.staminaPotions).toEqual({ count: 3, boundCount: 2 });
    expect(mocks.character?.stamina).toEqual(staminaBefore);
  });
});
