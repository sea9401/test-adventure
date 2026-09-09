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
