import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFarmState } from "@/adventure/v2/farm";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import { kstWeekMondayKey } from "@/lib/kst";

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => [{ buildings: {} }]),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-alchemist"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/settlementBuildingAccess", () => ({
  buildingLevelFromSlots: vi.fn(() => 3),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
  recordRewardFailureSoon: vi.fn(),
}));

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { buildingLevelFromSlots } from "@/lib/server/settlementBuildingAccess";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/alchemy-workshop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildingLevelFromSlots).mockReturnValue(3);
  vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
    if (key === "farm.v2") {
      return {
        ...emptyFarmState(),
        inventory: { herb: 30, silverleaf: 3 },
      };
    }
    return {
      hpCharges: 100_000,
      mpCharges: 200_000,
      guildAlchemyWeekly: { weekKey: kstWeekMondayKey(), energyUsed: 0 },
    };
  });
});

describe("길드 연금 공방", () => {
  it("농장 재료와 주간 연성력을 소비해 HP 충전량을 원자적으로 지급한다", async () => {
    const response = await POST(
      request({ recipeId: "concentrated_solution", target: "hp", quantity: 2 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.crafted).toMatchObject({
      recipeId: "concentrated_solution",
      quantity: 2,
      hpCharged: 450_000,
      mpCharged: 0,
    });
    expect(json.materials).toEqual({ herb: 10, silverleaf: 1 });
    expect(json.weeklyEnergy).toEqual({ used: 6, limit: 20, remaining: 14 });
    expect(json.charges).toMatchObject({ hp: 550_000, mp: 200_000 });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-alchemist",
      "farm.v2",
      expect.objectContaining({ inventory: { herb: 10, silverleaf: 1 } }),
    );
    expect(logGuildActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "alchemy_craft", actorUserId: "u-alchemist" }),
    );
  });

  it("시설 레벨보다 높은 레시피는 재료 차감 전에 거부한다", async () => {
    vi.mocked(buildingLevelFromSlots).mockReturnValue(1);
    const response = await POST(
      request({ recipeId: "refined_solution", target: "hp", quantity: 1 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("recipe_locked");
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("주간 연성력보다 많은 조제는 거부한다", async () => {
    const response = await POST(
      request({ recipeId: "concentrated_solution", target: "balanced", quantity: 7 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("insufficient_energy");
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("충전 상한을 넘으면 재료를 소비하지 않는다", async () => {
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "farm.v2") {
        return {
          ...emptyFarmState(),
          inventory: { herb: 30, silverleaf: 3 },
        };
      }
      return { hpCharges: MAX_CHARGE - 10_000, mpCharges: 0 };
    });
    const response = await POST(
      request({ recipeId: "basic_solution", target: "hp", quantity: 1 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("charge_capacity");
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
