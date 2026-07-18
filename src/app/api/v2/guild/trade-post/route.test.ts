import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUILD_TRADE_USER_SAVE_KEY } from "@/adventure/data/v2/guildTrade";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
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
  ensureUser: vi.fn(async () => "u-trader"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/settlementBuildingAccess", () => ({
  buildingLevelFromSlots: vi.fn(() => 3),
}));
vi.mock("@/lib/server/guildTrade", () => ({
  lockGuildTradeWeekly: vi.fn(),
  saveGuildTradeWeekly: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildTradeInventory", () => ({
  lockGuildTradeItem: vi.fn(),
  readGuildTradeItemBalances: vi.fn(async () => ({ "material:v2_timber": 100 })),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(async (_tx, _userId, _key, fallback) => fallback),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: 5_000_000 })),
  upsertGuildResources: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2GuildFame", () => ({
  addGuildFame: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));

import { lockGuildTradeWeekly, saveGuildTradeWeekly } from "@/lib/server/guildTrade";
import {
  lockGuildTradeItem,
  readGuildTradeItemBalances,
} from "@/lib/server/guildTradeInventory";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { upsertGuildResources } from "@/lib/server/v2GuildResources";
import { POST } from "./route";

const CONTRACT_ID = "material:v2_timber";
const consume = vi.fn(async () => undefined);

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/trade-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function weekly(progress = 0) {
  return {
    guildId: 7,
    weekKey: kstWeekMondayKey(),
    contractIds: [CONTRACT_ID],
    progress: { [CONTRACT_ID]: progress },
    completedIds: [],
    eligibleUserIds: ["u-trader"],
    target: 40,
  };
}

function userState(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    guildId: 7,
    weekKey: kstWeekMondayKey(),
    tokens: 0,
    contributionPoints: 0,
    purchases: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly());
  vi.mocked(lockGuildTradeItem).mockResolvedValue({ owned: 100, consume });
  vi.mocked(readGuildTradeItemBalances).mockResolvedValue({ [CONTRACT_ID]: 100 });
  vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
    if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
    return {};
  });
});

describe("길드 교역소", () => {
  it("보유 채집품을 묶음 단위로 납품하고 같은 점수의 교역 토큰을 지급한다", async () => {
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 2 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.delivered).toEqual({
      itemName: "소나무 원목",
      quantity: 20,
      points: 2,
      completed: false,
    });
    expect(json.tokens).toBe(2);
    expect(json.contribution.points).toBe(2);
    expect(consume).toHaveBeenCalledWith(20);
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ progress: { [CONTRACT_ID]: 2 } }),
    );
  });

  it("마지막 납품으로 계약을 완료하면 시설 보너스가 적용된 길드 보상을 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(39));
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.guildReward).toEqual({ gold: 1_800_000, fame: 120 });
    expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
      gold: 6_800_000,
    });
    expect(addGuildFame).toHaveBeenCalledWith(expect.anything(), 7, 120);
    expect(logGuildActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "trade_contract_complete",
        actorUserId: "u-trader",
      }),
    );
  });

  it("고가치 품목은 남은 목표보다 점수가 커도 마지막 묶음으로 계약을 완료한다", async () => {
    const premiumId = "fishing_item:catch_legendary";
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue({
      ...weekly(),
      contractIds: [premiumId],
      progress: { [premiumId]: 48 },
      target: 50,
    });
    vi.mocked(lockGuildTradeItem).mockResolvedValue({ owned: 1, consume });
    vi.mocked(readGuildTradeItemBalances).mockResolvedValue({ [premiumId]: 0 });

    const response = await POST(
      request({ action: "deliver", contractId: premiumId, batches: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.delivered).toMatchObject({ points: 8, completed: true });
    expect(json.contracts[0]).toMatchObject({ progress: 50, completed: true });
    expect(json.tokens).toBe(8);
  });

  it("개인 주간 납품 한도를 넘는 요청은 아이템을 소비하지 않는다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue(userState({ contributionPoints: 160 }));
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 1 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("contribution_cap");
    expect(consume).not.toHaveBeenCalled();
  });

  it("교역 토큰으로 해금된 제작 재료를 구매한다", async () => {
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState({ tokens: 100 });
      if (key === "character.v2") return { materials: {} };
      return {};
    });
    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(80);
    expect(json.purchased.itemName).toBe("정제 철괴");
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      "character.v2",
      { materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 } },
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      GUILD_TRADE_USER_SAVE_KEY,
      expect.objectContaining({ tokens: 80, purchases: { refined_iron: 1 } }),
    );
  });
});
