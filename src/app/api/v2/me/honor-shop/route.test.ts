import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", () => ({
  V2_SETTLEMENT_WARFARE: true,
  HONOR_SHOP_STAMINA_POTION_COST: 100,
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-honor-shop"),
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ value: mocks.saves.get("character.v2") }]),
        })),
      })),
    })),
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
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

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { GET, POST } from "./route";

function request(itemId: string) {
  return new Request("http://localhost/api/v2/me/honor-shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    honor: 500,
    honorEarned: 900,
    materials: { v2_craft_sunstone: 2 },
  });
  mocks.saves.set("stamina-potions.v1", { count: 3, boundCount: 1 });
});

describe("개인 명성상점", () => {
  it("스태미나 회복약과 제작 재료 5종의 가격·지급 정보를 노출한다", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      honor: 500,
      honorEarned: 900,
      items: [
        { id: "stamina_potion", name: "스태미나 회복약", cost: 100, grantKind: "stamina_potion", targetId: "stamina_potion", quantity: 1 },
        { id: "v2_craft_refined_iron", name: "정제 철괴", cost: 10, grantKind: "material", targetId: "v2_craft_refined_iron", quantity: 1 },
        { id: "v2_craft_mithril_shard", name: "미스릴 조각", cost: 20, grantKind: "material", targetId: "v2_craft_mithril_shard", quantity: 1 },
        { id: "v2_craft_sunstone", name: "태양석", cost: 40, grantKind: "material", targetId: "v2_craft_sunstone", quantity: 1 },
        { id: "v2_craft_aurora_crystal", name: "오로라 결정", cost: 50, grantKind: "material", targetId: "v2_craft_aurora_crystal", quantity: 1 },
        { id: "v2_craft_abyssal_starsteel", name: "심해성철", cost: 70, grantKind: "material", targetId: "v2_craft_abyssal_starsteel", quantity: 1 },
      ],
    });
  });

  it("재료 구매는 명성만 차감하고 같은 character 저장에 재료 1개를 누적한다", async () => {
    const response = await POST(request("v2_craft_sunstone"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      honor: 460,
      honorEarned: 900,
      granted: {
        itemId: "v2_craft_sunstone",
        name: "태양석",
        kind: "material",
        targetId: "v2_craft_sunstone",
        quantity: 1,
      },
      materials: { v2_craft_sunstone: 3 },
    });
    expect(mocks.saves.get("character.v2")).toEqual({
      honor: 460,
      honorEarned: 900,
      materials: { v2_craft_sunstone: 3 },
    });
    expect(lockSaveForUpdate).toHaveBeenCalledTimes(1);
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });

  it("스태미나 회복약은 기존 보조 저장 키에 귀속 수량으로 지급한다", async () => {
    const response = await POST(request("stamina_potion"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      honor: 400,
      granted: {
        itemId: "stamina_potion",
        name: "스태미나 회복약",
        kind: "stamina_potion",
        quantity: 1,
      },
      staminaPotions: 4,
    });
    expect(mocks.saves.get("stamina-potions.v1")).toEqual({
      count: 4,
      boundCount: 2,
    });
  });

  it("명성이 부족하면 명성과 재료를 전혀 변경하지 않는다", async () => {
    mocks.saves.set("character.v2", {
      honor: 39,
      honorEarned: 900,
      materials: { v2_craft_sunstone: 2 },
    });
    const before = structuredClone(mocks.saves.get("character.v2"));

    const response = await POST(request("v2_craft_sunstone"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "insufficient_honor",
      honor: 39,
    });
    expect(mocks.saves.get("character.v2")).toEqual(before);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("등록되지 않은 품목은 저장 잠금 전에 거부한다", async () => {
    const response = await POST(request("v2_unexplored_iron_legion_material"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "no_such_item" });
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
