import { beforeEach, describe, expect, it, vi } from "vitest";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-member"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: vi.fn(),
}));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", () => ({
  lockGuildFacilityDonationProgress: vi.fn(),
  setGuildFacilityDonationProgress: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";
import {
  lockGuildFacilityDonationProgress,
  setGuildFacilityDonationProgress,
} from "@/lib/server/guildFacilityUpgradeDonations";
import { POST } from "./route";

const PINE = WOODCUTTING_MATERIAL_ID.pine;
const IRON = MINING_MATERIAL_ID.iron;
const ctx = { params: Promise.resolve({ buildingId: "guild_smithy" }) };

function request(donations: Record<string, number>): Request {
  return new Request("http://localhost/api/v2/guild/facilities/guild_smithy/donate", {
    method: "POST",
    body: JSON.stringify({ donations }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockGuildSettlementBuilding).mockResolvedValue({
    village: {
      outpostId: "legacy-guild-outpost",
      guildId: 7,
      ownerUserId: null,
      tier: "village",
      name: "기존 영지",
      productionKind: null,
      unlockedSlots: 1,
      slotKinds: {},
      buildings: { 0: { id: "guild_smithy", level: 1 } },
      jobs: {},
    },
    slot: 0,
  });
  vi.mocked(lockSaveForUpdate).mockResolvedValue({
    materials: { [PINE]: 100, [IRON]: 80 },
  });
  vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
    crop: 200,
    ore: 100,
  });
});

describe("길드 시설 재료 기부", () => {
  it("길드원이 남은 요구량 안에서 원하는 만큼 공동 진행도에 기부한다", async () => {
    const response = await POST(request({ [PINE]: 30, [IRON]: 40 }), ctx);

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-member",
      "character.v2",
      { materials: { [PINE]: 70, [IRON]: 40 } },
    );
    expect(setGuildFacilityDonationProgress).toHaveBeenCalledWith(
      expect.anything(),
      7,
      "guild_smithy",
      2,
      { crop: 230, ore: 140 },
    );
  });

  it("남은 요구량을 넘는 기부는 재료를 차감하지 않고 거부한다", async () => {
    vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
      crop: 450,
      ore: 100,
    });
    const response = await POST(request({ [PINE]: 60 }), ctx);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("exceeds_required");
    expect(upsertSave).not.toHaveBeenCalled();
    expect(setGuildFacilityDonationProgress).not.toHaveBeenCalled();
  });

  it("현재 단계에 필요하지 않은 상위 재료는 받지 않는다", async () => {
    const response = await POST(
      request({ [WOODCUTTING_MATERIAL_ID.birch]: 1 }),
      ctx,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("material_not_required");
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("최대 레벨 시설에는 기부할 수 없다", async () => {
    vi.mocked(lockGuildSettlementBuilding).mockResolvedValue({
      village: {
        outpostId: "legacy-guild-outpost",
        guildId: 7,
        ownerUserId: null,
        tier: "village",
        name: "기존 영지",
        productionKind: null,
        unlockedSlots: 1,
        slotKinds: {},
        buildings: { 0: { id: "guild_smithy", level: 5 } },
        jobs: {},
      },
      slot: 0,
    });

    const response = await POST(request({ [PINE]: 1 }), ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("max_level");
  });
});
