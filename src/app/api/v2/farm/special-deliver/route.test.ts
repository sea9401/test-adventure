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

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/farm/special-deliver", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.userId = "farm-user";
  mocks.farm = emptyFarmState();
  mocks.farm.inventory = { golden_wheat: 4 };
  mocks.farm.stats.reputation = 10;
});

describe("희귀 수확 납품 API", () => {
  it("수량을 지정하지 않으면 1회만 납품한다", async () => {
    const response = await POST(request({ requestId: "rare-golden-wheat" }));
    expect(response.status).toBe(200);
    expect((await response.json()).specialDeliveryResult).toMatchObject({ count: 1, rewardReputation: 3 });
    expect(mocks.farm!.inventory).toEqual({ golden_wheat: 3 });
  });

  it("한 요청으로 보유 수량까지 여러 번 납품한다", async () => {
    const response = await POST(request({ requestId: "rare-golden-wheat", count: 99 }));
    expect(response.status).toBe(200);
    expect((await response.json()).specialDeliveryResult).toMatchObject({ count: 4, rewardReputation: 12 });
    expect(mocks.farm!.inventory).toEqual({});
    expect(mocks.farm!.stats.reputation).toBe(22);
  });

  it.each([0, -1, 1.5, "3"])("잘못된 수량 %s는 저장을 바꾸지 않고 거절한다", async (count) => {
    const saved = structuredClone(mocks.farm);
    const response = await POST(request({ requestId: "rare-golden-wheat", count }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "bad_request" });
    expect(mocks.farm).toEqual(saved);
  });
});
