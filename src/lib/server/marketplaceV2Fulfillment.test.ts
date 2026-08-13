import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_executor, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_executor, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));
vi.mock("@/lib/server/equipGrant", () => ({
  appendEquipInstances: vi.fn(),
}));

import { deliverMarketplaceListing } from "./marketplaceV2Fulfillment";

function specimenListing(quantity: number) {
  return {
    kind: "consumable",
    itemId: "fish_specimen_carp",
    quantity,
    instancePayload: { kind: "fish_specimen", fishId: "carp" },
  } as Parameters<typeof deliverMarketplaceListing>[2];
}

describe("거래소 물고기 표본 배송", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", {});
  });

  it("구매자 표본 인벤토리에 체결 수량만 더한다", async () => {
    store.set("fishing-specimens.v1", { version: 1, items: { carp: 1 } });

    const result = await deliverMarketplaceListing(
      {} as Parameters<typeof deliverMarketplaceListing>[0],
      "buyer",
      specimenListing(2),
    );

    expect(result).toBeNull();
    expect(store.get("fishing-specimens.v1")).toEqual({
      version: 1,
      items: { carp: 3 },
    });
    expect(store.get("character.v2")).toEqual({});
  });
});

describe("거래소 위험 해역 어획물 배송", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", {
      materials: { danger_catch_ironjaw_tuna: 1 },
    });
  });

  it("구매자 재료 인벤토리에 체결 수량을 더한다", async () => {
    const result = await deliverMarketplaceListing(
      {} as Parameters<typeof deliverMarketplaceListing>[0],
      "buyer",
      {
        kind: "material",
        itemId: "danger_catch_ironjaw_tuna",
        quantity: 4,
        instancePayload: null,
      } as Parameters<typeof deliverMarketplaceListing>[2],
    );

    expect(result).toBeNull();
    expect(store.get("character.v2")).toEqual({
      materials: { danger_catch_ironjaw_tuna: 5 },
    });
  });
});
