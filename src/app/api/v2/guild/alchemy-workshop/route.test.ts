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
vi.mock("@/lib/server/adventurerAssociation", () => ({
  associationFacilityLevel: vi.fn(async () => 1),
  claimWeeklyFacilitySource: vi.fn(async () => ({ ok: true })),
}));

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { buildingLevelFromSlots } from "@/lib/server/settlementBuildingAccess";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { POST } from "./route";

function request(body: Record<string, unknown>, association = false) {
  const query = association ? "?scope=association" : "";
  return new Request(`http://localhost/api/v2/guild/alchemy-workshop${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGuildId).mockResolvedValue(7);
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
  it("길드 가입자는 협회 범위로 직접 요청해도 거부한다", async () => {
    const response = await POST(
      request(
        { recipeId: "basic_solution", target: "hp", quantity: 1 },
        true,
      ),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("association_for_solo_only");
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
  });

  it("농장 재료와 주간 연성력을 소비해 HP 충전량을 원자적으로 지급한다", async () => {
    const response = await POST(
      request({ recipeId: "concentrated_solution", target: "hp", quantity: 2 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.crafted).toMatchObject({
      recipeId: "concentrated_solution",
      quantity: 2,
      hpCharged: 1_800_000,
      mpCharged: 0,
    });
    expect(json.materials).toEqual({ herb: 10, silverleaf: 1 });
    expect(json.weeklyEnergy).toEqual({ used: 6, limit: 20, remaining: 14 });
    expect(json.charges).toMatchObject({ hp: 1_900_000, mp: 200_000 });
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

  it("Lv.4 활력 영약은 충전 한도와 무관하게 스태미나 회복약을 지급한다", async () => {
    vi.mocked(buildingLevelFromSlots).mockReturnValue(4);
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "farm.v2") {
        return {
          ...emptyFarmState(),
          inventory: { herb: 40, silverleaf: 5 },
        };
      }
      if (key === "stamina-potions.v1") return { count: 2 };
      return { hpCharges: MAX_CHARGE, mpCharges: MAX_CHARGE };
    });

    const response = await POST(
      request({ recipeId: "vitality_elixir", target: "hp", quantity: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.crafted).toMatchObject({
      output: "stamina_potion",
      staminaPotionsGranted: 1,
      staminaPotions: 3,
      totalCharged: 0,
    });
    expect(json.materials).toEqual({ herb: 10, silverleaf: 1 });
    expect(json.weeklyEnergy).toEqual({ used: 20, limit: 24, remaining: 4 });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-alchemist",
      "stamina-potions.v1",
      { count: 3 },
    );
  });

  it("강화 촉매는 농장 재료와 연성력을 사용해 기존 강화석 보유량에 합산한다", async () => {
    vi.mocked(buildingLevelFromSlots).mockReturnValue(3);
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === "character.v2") {
        return { materials: { v2_blue_enhance_stone: 2 } };
      }
      if (key === "farm.v2") {
        return {
          ...emptyFarmState(),
          inventory: { herb: 40, silverleaf: 5 },
        };
      }
      if (key === "stamina-potions.v1") return { count: 2 };
      return {
        hpCharges: 100_000,
        mpCharges: 200_000,
        guildAlchemyWeekly: { weekKey: kstWeekMondayKey(), energyUsed: 0 },
      };
    });

    const response = await POST(
      request({ recipeId: "stable_catalyst", target: "balanced", quantity: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.crafted).toMatchObject({
      output: "material",
      materialId: "v2_blue_enhance_stone",
      materialName: "푸른 강화석",
      materialGranted: 1,
      materialBalance: 3,
      totalCharged: 0,
    });
    expect(json.materials).toEqual({ herb: 28, silverleaf: 4 });
    expect(json.weeklyEnergy).toEqual({ used: 8, limit: 20, remaining: 12 });
    expect(json.craftedMaterials.v2_blue_enhance_stone).toBe(3);
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-alchemist",
      "character.v2",
      { materials: { v2_blue_enhance_stone: 3 } },
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
