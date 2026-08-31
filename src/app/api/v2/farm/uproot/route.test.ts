import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFarmState, FARM_CROPS, FARM_SAVE_KEY, plantCrop } from "@/adventure/v2/farm";

const mocks = vi.hoisted(() => ({
  userId: "farm-user" as string | null,
  farm: null as unknown,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/farmingRateLimit", () => ({
  enforceFarmingRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => mocks.farm),
  upsertSave: vi.fn(async (_tx, _userId, _key, value) => {
    mocks.farm = value;
  }),
}));

import { upsertSave } from "@/lib/server/savesKv";
import { POST } from "./route";

function request(plotId: unknown) {
  return new Request("http://localhost/api/v2/farm/uproot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plotId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "farm-user";
  mocks.farm = plantCrop(emptyFarmState(1_000), "plot-1", "wheat", Date.now());
});

describe("농작물 파내기 API", () => {
  it("성장 중인 밭만 비우고 같은 농장 저장 키에 반영한다", async () => {
    const response = await POST(request("plot-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.farm.plots[0].cropId).toBeNull();
    expect(json.uprootedPlotId).toBe("plot-1");
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "farm-user",
      FARM_SAVE_KEY,
      expect.objectContaining({
        plots: expect.arrayContaining([
          expect.objectContaining({ id: "plot-1", cropId: null }),
        ]),
      }),
    );
  });

  it("이미 수확 가능한 작물은 파내지 않는다", async () => {
    mocks.farm = plantCrop(
      emptyFarmState(1_000),
      "plot-1",
      "wheat",
      Date.now() - FARM_CROPS.wheat.growMs,
    );

    const response = await POST(request("plot-1"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "already_ready" });
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
