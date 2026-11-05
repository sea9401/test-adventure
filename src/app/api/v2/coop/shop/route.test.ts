import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOP_COIN_MATERIAL_ID } from "@/adventure/data/v2/coopRewards";
import {
  COOP_SHOP_ENTRIES,
  COOP_SHOP_STATE_KEY,
} from "@/adventure/v2/coop/coopShop";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "raider-1"),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => true),
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

import { upsertSave } from "@/lib/server/savesKv";
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/coop/shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setCoins(coins: number) {
  mocks.saves.set("character.v2", {
    materials: { [COOP_COIN_MATERIAL_ID]: coins },
  });
}

function coins() {
  const save = mocks.saves.get("character.v2") as {
    materials: Record<string, number>;
  };
  return save.materials[COOP_COIN_MATERIAL_ID] ?? 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  setCoins(1_000);
  mocks.saves.set(STAMINA_POTIONS_KEY, { count: 2, boundCount: 0 });
});

describe("협동 교환소 수량 교환", () => {
  it("요청 한 번으로 회복약 30개를 교환하고 비용과 주간 횟수를 함께 반영한다", async () => {
    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 30 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      quantity: 30,
      staminaPotions: 32,
      limits: { stamina_potion: { used: 30, limit: 30 } },
    });
    expect(coins()).toBe(1_000 - 25 * 30);
    expect(mocks.saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 32,
      boundCount: 30,
    });
  });

  it("수량이 없는 기존 요청은 1개만 교환한다", async () => {
    const response = await POST(request({ itemId: "stamina_potion" }));

    expect(response.status).toBe(200);
    expect(coins()).toBe(975);
    expect(mocks.saves.get(STAMINA_POTIONS_KEY)).toMatchObject({ count: 3 });
  });

  it("남은 횟수를 넘으면 일부만 교환하지 않고 전부 거절한다", async () => {
    await POST(request({ itemId: "stamina_potion", quantity: 25 }));
    vi.mocked(upsertSave).mockClear();
    const before = coins();

    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 6 }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "limit_reached" });
    expect(coins()).toBe(before);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("재료가 수량만큼 없으면 전부 거절한다", async () => {
    setCoins(25 * 2);

    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 3 }),
    );

    expect(response.status).toBe(402);
    expect(coins()).toBe(50);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("재료로 받는 상품은 수량만큼 지급한다", async () => {
    const box = COOP_SHOP_ENTRIES.find((e) => e.category === "equipment_box")!;
    if (box.output.kind !== "material") throw new Error("상자 구성 변경");
    mocks.saves.set("character.v2", {
      materials: Object.fromEntries(
        Object.entries(box.cost.materials).map(([id, need]) => [id, need * 3]),
      ),
    });

    const response = await POST(request({ itemId: box.itemId, quantity: 2 }));

    expect(response.status).toBe(200);
    const save = mocks.saves.get("character.v2") as {
      materials: Record<string, number>;
    };
    expect(save.materials[box.output.materialId]).toBe(2);
    for (const [id, need] of Object.entries(box.cost.materials)) {
      expect(save.materials[id]).toBe(need);
    }
  });

  it("칭호는 수량을 2 이상으로 요청할 수 없다", async () => {
    const title = COOP_SHOP_ENTRIES.find((e) => e.output.kind === "title")!;

    const response = await POST(request({ itemId: title.itemId, quantity: 2 }));

    expect(response.status).toBe(400);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, "3", 1000])("잘못된 수량 %s 은 거절한다", async (quantity) => {
    const response = await POST(
      request({ itemId: "stamina_potion", quantity }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(mocks.saves.get(COOP_SHOP_STATE_KEY)).toBeUndefined();
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
