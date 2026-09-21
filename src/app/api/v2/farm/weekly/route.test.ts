import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFarmState, type FarmState } from "@/adventure/v2/farm";

const mocks = vi.hoisted(() => ({ farm: null as FarmState | null, userId: "farm-user" as string | null }));
vi.mock("@/db", () => ({ db: { transaction: async (callback: (tx: object) => unknown) => callback({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => mocks.userId }));
vi.mock("@/lib/server/farmingRateLimit", () => ({ enforceFarmingRateLimit: () => null }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: async () => mocks.farm,
  upsertSave: async (_tx: unknown, _userId: string, _key: string, farm: FarmState) => { mocks.farm = farm; },
}));

import { POST } from "./route";

function request(requestId: string) {
  return new Request("http://localhost/api/v2/farm/weekly", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId }),
  });
}

beforeEach(() => {
  mocks.userId = "farm-user";
  mocks.farm = emptyFarmState();
  mocks.farm.inventory = { tomato: 30, cacao: 8 };
});

describe("선택형 주간 납품 API", () => {
  it.each([
    ["weekly-bakery-crate", "wheat", 30, "golden_wheat", 11, 6],
    ["weekly-clinic-bundle", "herb", 16, "silverleaf", 13, 6],
    ["weekly-market-cart", "corn", 24, "sweet_corn", 15, 6],
    ["weekly-tomato", "tomato", 15, "heirloom_tomato", 14, 3],
    ["weekly-strawberry", "strawberry", 8, "white_strawberry", 15, 2],
    ["weekly-potato", "potato", 10, "golden_potato", 16, 1],
    ["weekly-onion", "onion", 7, "pearl_onion", 17, 1],
    ["weekly-rice", "rice", 8, "golden_rice", 18, 1],
    ["weekly-soybean", "soybean", 7, "black_soybean", 19, 1],
    ["weekly-sugarcane", "sugarcane", 6, "crystal_sugarcane", 20, 1],
    ["weekly-cacao", "cacao", 4, "royal_cacao", 21, 1],
  ] as const)("%s는 저장된 희귀 작물 1개를 소모하고 보너스를 포함해 지급한다", async (id, crop, quantity, rare, reputation, seeds) => {
    mocks.farm!.inventory = { [crop]: quantity + 1, [rare]: 2 };
    mocks.farm!.seeds = {};
    mocks.farm!.stats.reputation = 100;

    const response = await POST(request(id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.weeklyDeliveryResult).toMatchObject({ rareBonusApplied: true, rewardReputation: reputation });
    expect(body.farm.inventory).toEqual({ [crop]: 1, [rare]: 1 });
    expect(mocks.farm!.inventory).toEqual({ [crop]: 1, [rare]: 1 });
    expect(mocks.farm!.stats.reputation).toBe(100 + reputation);
    expect(mocks.farm!.seeds).toEqual({ [crop]: seeds });

    const saved = structuredClone(mocks.farm);
    expect((await POST(request(id))).status).toBe(409);
    expect(mocks.farm).toEqual(saved);
  });

  it("황금 밀이 없으면 다른 희귀 작물을 소모하지 않고 기본 증표만 지급한다", async () => {
    mocks.farm!.inventory = { wheat: 376, silverleaf: 2 };
    const response = await POST(request("weekly-bakery-crate"));
    expect(response.status).toBe(200);
    expect((await response.json()).weeklyDeliveryResult).toMatchObject({ rareBonusApplied: false, rewardReputation: 6 });
    expect(mocks.farm!.inventory).toEqual({ wheat: 346, silverleaf: 2 });
    expect(mocks.farm!.stats.reputation).toBe(6);
  });

  it.each(["not_enough_items", "weekly_delivery_limit"] as const)("%s 실패 시 황금 밀과 보상이 바뀌지 않는다", async (error) => {
    mocks.farm!.inventory = { wheat: error === "not_enough_items" ? 29 : 30, golden_wheat: 1 };
    if (error === "weekly_delivery_limit") {
      mocks.farm!.weekly.claimedIds = ["weekly-tomato", "weekly-potato", "weekly-cacao"];
    }
    const saved = structuredClone(mocks.farm);
    const response = await POST(request("weekly-bakery-crate"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error });
    expect(mocks.farm).toEqual(saved);
  });

  it("기존 2건 완료 후 새 작물을 세 번째로 납품하고 11종 목록을 반환한다", async () => {
    mocks.farm!.weekly.claimedIds = ["weekly-bakery-crate", "weekly-clinic-bundle"];
    const response = await POST(request("weekly-tomato"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.weeklyDeliveries).toHaveLength(11);
    expect(body.farm.weekly.claimedIds).toEqual(["weekly-bakery-crate", "weekly-clinic-bundle", "weekly-tomato"]);
    expect(mocks.farm!.inventory.tomato).toBe(15);
    const before = structuredClone(mocks.farm);
    const rejected = await POST(request("weekly-cacao"));
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ ok: false, error: "weekly_delivery_limit" });
    expect(mocks.farm).toEqual(before);
  });

  it("같은 요청을 재전송해도 보상이 중복 지급되지 않는다", async () => {
    await POST(request("weekly-cacao"));
    const before = structuredClone(mocks.farm);
    const response = await POST(request("weekly-cacao"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "weekly_delivery_already_claimed" });
    expect(mocks.farm).toEqual(before);
  });
});
