import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "cook-user") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => mocks.store.set(key, value)),
}));

import { POST } from "./route";
import { COOKING_BUFF_DURATION_MS, cookingFoodId } from "@/adventure/v2/cooking/food";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

function request(itemId: string) {
  return new Request("http://localhost/api/v2/me/use-cooking-food", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

describe("use cooking food", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.store.clear();
  });

  it("원조·전문 분야 효과 스냅샷을 보존해 정확히 12시간 버프로 교체한다", async () => {
    const itemId = cookingFoodId({
      recipeId: "tomato_salad",
      quality: "masterpiece",
      originator: true,
      specialtyBonusPct: 5,
    });
    mocks.store.set("character.v2", {
      activeFoodBuff: { recipeId: "old", expiresAt: NOW + 99_999_999 },
    });
    mocks.store.set("inventory.v2", { cookingFoods: { [itemId]: 1 } });

    const response = await POST(request(itemId));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.activeBuff).toMatchObject({
      recipeId: "tomato_salad",
      quality: "masterpiece",
      expiresAt: NOW + COOKING_BUFF_DURATION_MS,
    });
    expect(json.activeBuff.effect.combatFlat.atk).toBeGreaterThan(100);
    expect(mocks.store.get("inventory.v2")).toMatchObject({ cookingFoods: {} });
  });

  it("같은 음식도 남은 시간에 누적하지 않고 12시간으로 초기화한다", async () => {
    const itemId = cookingFoodId({ recipeId: "tomato_salad", quality: "normal", originator: false, specialtyBonusPct: 0 });
    mocks.store.set("character.v2", {
      activeFoodBuff: { recipeId: "tomato_salad", recipeName: "기존", quality: "normal", effect: {}, expiresAt: NOW + 6 * 60 * 60 * 1_000 },
    });
    mocks.store.set("inventory.v2", { cookingFoods: { [itemId]: 1 } });

    const response = await POST(request(itemId));
    await expect(response.json()).resolves.toMatchObject({ activeBuff: { expiresAt: NOW + COOKING_BUFF_DURATION_MS } });
  });
});
