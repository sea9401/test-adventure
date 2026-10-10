import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  level: 5,
  operations: { targetLevel: 6, points: 120, weekKey: "2026-10-12", weekPoints: 40 },
  saveOperations: vi.fn(async () => undefined),
  upsertVillage: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => ({ db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "admin" }));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId: async () => 7 }));
vi.mock("@/lib/server/guildAdmin", () => ({ isGuildAdmin: async () => true }));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: async () => ({ gold: 10_000_000_000 }),
  upsertGuildResources: async () => undefined,
}));
vi.mock("@/lib/server/v2GuildFame", () => ({
  lockGuildFame: async () => ({ fameAvailable: 1_000_000 }),
  spendGuildFame: async () => undefined,
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: async () => ({
    village: { buildings: { 0: { id: "trade_post", level: m.level } } },
    slot: 0,
  }),
  rememberGuildSettlementBuildingLevel: async () => undefined,
  upsertVillage: m.upsertVillage,
}));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", async () => {
  const { nextSettlementBuildingUpgrade } = await import("@/adventure/data/v2/settlement");
  return {
    lockGuildFacilityDonationProgress: async () => {
      const next = nextSettlementBuildingUpgrade("trade_post", m.level, "guild_facility")!;
      return Object.fromEntries(
        Object.entries(next.cost).filter(([key]) => key !== "gold" && key !== "fame"),
      );
    },
    clearGuildFacilityDonationProgress: async () => undefined,
  };
});
vi.mock("@/lib/server/guildActivityLog", () => ({ logGuildActivity: async () => undefined }));
vi.mock("@/lib/server/guildFacilityOperations", () => ({
  lockGuildFacilityOperations: async () => ({ ...m.operations }),
  saveGuildFacilityOperations: m.saveOperations,
}));

import { POST } from "./route";

function call() {
  return POST(new Request("http://x", { method: "POST" }), {
    params: Promise.resolve({ buildingId: "trade_post" }),
  });
}

describe("길드 시설 Lv.6 이상 업그레이드", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.level = 5;
    m.operations = { targetLevel: 6, points: 120, weekKey: "2026-10-12", weekPoints: 40 };
  });

  it("운영 실적이 부족하면 409 operations_incomplete", async () => {
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "operations_incomplete",
      operations: { points: 120, required: 200 },
    });
    expect(m.upsertVillage).not.toHaveBeenCalled();
  });

  it("실적을 채우면 완료하고 다음 목표로 넘기며 주간 적립량은 유지한다", async () => {
    m.operations = { targetLevel: 6, points: 200, weekKey: "2026-10-12", weekPoints: 40 };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ buildingLevel: 6 });
    expect(m.saveOperations).toHaveBeenCalledWith({}, 7, "trade_post", {
      targetLevel: 7,
      points: 0,
      weekKey: "2026-10-12",
      weekPoints: 40,
    });
  });

  it("Lv.5 이하 목표는 실적을 보지 않는다", async () => {
    m.level = 4;
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.saveOperations).not.toHaveBeenCalled();
  });
});
