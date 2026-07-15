import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-manager"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildAdmin: vi.fn(async () => true),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 100_000_000 })),
  upsertGuildResources: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2GuildFame", () => ({
  lockGuildFame: vi.fn(async () => ({ fameAvailable: 10_000 })),
  spendGuildFame: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  lockVillage: vi.fn(),
  rememberGuildSettlementBuildingLevel: vi.fn(async () => undefined),
  upsertVillage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", () => ({
  clearGuildFacilityDonationProgress: vi.fn(async () => undefined),
  lockGuildFacilityDonationProgress: vi.fn(),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { lockVillage, upsertVillage } from "@/lib/server/v2Settlement";
import {
  clearGuildFacilityDonationProgress,
  lockGuildFacilityDonationProgress,
} from "@/lib/server/guildFacilityUpgradeDonations";
import { upsertGuildResources } from "@/lib/server/v2GuildResources";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ buildingId: "guild_smithy" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockVillage).mockResolvedValue({
    outpostId: "guild-facility:7:guild_smithy",
    guildId: 7,
    ownerUserId: null,
    tier: "village",
    name: null,
    productionKind: null,
    unlockedSlots: 1,
    slotKinds: {},
    buildings: { 0: { id: "guild_smithy", level: 1 } },
    jobs: {},
  });
  vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
    crop: 250,
    ore: 250,
  });
});

describe("길드 시설 업그레이드 완료", () => {
  it("재료가 모두 모이면 관리자가 골드·명성을 확인한 뒤 레벨을 올린다", async () => {
    const response = await POST(new Request("http://localhost"), ctx);

    expect(response.status).toBe(200);
    expect(upsertVillage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        buildings: { 0: { id: "guild_smithy", level: 2 } },
      }),
    );
    expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
      gold: 80_000_000,
    });
    expect(clearGuildFacilityDonationProgress).toHaveBeenCalledWith(
      expect.anything(),
      7,
      "guild_smithy",
    );
  });

  it("기부 재료가 덜 모였으면 완료할 수 없고 진행도는 유지한다", async () => {
    vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
      crop: 249,
      ore: 250,
    });

    const response = await POST(new Request("http://localhost"), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("insufficient_resources");
    expect(clearGuildFacilityDonationProgress).not.toHaveBeenCalled();
    expect(upsertVillage).not.toHaveBeenCalled();
  });
});
