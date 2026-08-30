import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/adventure/data/v2/coreLoopConfig")
  >()),
  V2_EQUIPMENT_LIBERATION: true,
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (cb: (tx: object) => unknown) => cb({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "./route";
import {
  STAMINA_SHARD_COMBINE_COST,
  STAMINA_SHARD_MATERIAL_ID,
} from "@/adventure/data/v2/staminaPotionCrafting";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";

beforeEach(() => {
  store.clear();
  store.set("character.v2", {
    gold: COMBINE_GOLD_COST,
    materials: { [STAMINA_SHARD_MATERIAL_ID]: STAMINA_SHARD_COMBINE_COST },
  });
  store.set("equipment.v2", {
    owned: [
      {
        iid: "discount-ring",
        id: "v2_storm_sanctuary_ring",
        liberation: {
          rank: 1,
          lineCount: 1,
          revision: 1,
          options: [
            { id: "personal_craft_gold_discount_pct", level: 20 },
          ],
        },
      },
    ],
    equipped: { ring: "discount-ring" },
  });
});

describe("POST /api/v2/me/stamina-potion-combine", () => {
  it("착용 반지 해방으로 조합 골드를 할인하되 재료 수량은 그대로 쓴다", async () => {
    const response = await POST(
      new Request("http://test/api/v2/me/stamina-potion-combine", {
        method: "POST",
        body: JSON.stringify({ quantity: 1 }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      baseGoldCost: COMBINE_GOLD_COST,
      goldCost: COMBINE_GOLD_COST * 0.9,
      liberationDiscountPct: 10,
      shardsLeft: 0,
      staminaPotions: 1,
      gold: COMBINE_GOLD_COST * 0.1,
    });
  });
});
