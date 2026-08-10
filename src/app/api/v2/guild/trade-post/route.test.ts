import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUILD_TRADE_USER_SAVE_KEY } from "@/adventure/data/v2/guildTrade";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
import { kstWeekMondayKey } from "@/lib/kst";

let mockRecipientIds = ["u-trader", "u-member"];
const tx = {
  select: vi.fn((fields?: Record<string, unknown>) => ({
    from: vi.fn(() => ({
      where: vi.fn(async () =>
        fields && "userId" in fields
          ? mockRecipientIds.map((userId) => ({ userId }))
          : [{ buildings: {} }],
      ),
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
vi.mock("@/lib/server/adventurerAssociation", () => ({
  claimWeeklyFacilitySource: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildMasterOrManager: vi.fn(async () => true),
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
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { GET, POST } from "./route";

const CONTRACT_ID = "material:v2_timber";
const consume = vi.fn(async () => undefined);

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/trade-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function weekly(progress = 0, tokens = 0, eligibleUserIds = ["u-trader"]) {
  return {
    guildId: 7,
    weekKey: kstWeekMondayKey(),
    contractIds: [CONTRACT_ID],
    progress: { [CONTRACT_ID]: progress },
    completedIds: [],
    eligibleUserIds,
    target: 40,
    tokens,
    purchases: {},
    memberPurchasesEnabled: true,
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
  mockRecipientIds = ["u-trader", "u-member"];
  vi.mocked(isGuildMasterOrManager).mockResolvedValue(true);
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly());
  vi.mocked(lockGuildTradeItem).mockResolvedValue({ owned: 100, consume });
  vi.mocked(readGuildTradeItemBalances).mockResolvedValue({ [CONTRACT_ID]: 100 });
  vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
    if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
    return {};
  });
});

describe("길드 교역소", () => {
  it("조회한 길드원에게 개인 잔고가 아닌 길드 공동 토큰을 보여준다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 37));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(37);
    expect(json).toMatchObject({
      canManage: true,
      canPurchase: true,
    });
    expect(json.shop[0]).toMatchObject({ tokenCost: 20, affordable: true });
  });

  it("일반 길드원은 공동 토큰 상점 물품을 선택할 수 없다", async () => {
    vi.mocked(isGuildMasterOrManager).mockResolvedValue(false);
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("guild_admin_required");
    expect(saveGuildTradeWeekly).not.toHaveBeenCalled();
  });

  it("관리자가 선택한 물품을 현재 길드원 전원에게 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
      if (key === "character.v2") return { materials: {} };
      return {};
    });

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.tokens).toBe(80);
    expect(json.purchased).toMatchObject({ recipientCount: 2 });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      "character.v2",
      { materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 } },
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-member",
      "character.v2",
      { materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 } },
    );
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokens: 80,
        purchases: { refined_iron: 1 },
      }),
    );
  });

  it("품목 구매 한도는 관리자 개인이 아니라 길드 전체에 적용한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue({
      ...weekly(0, 100),
      purchases: { refined_iron: 3 },
    });

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("purchase_limit");
    expect(upsertSave).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "character.v2",
      expect.anything(),
    );
  });

  it("보유 채집품을 납품하면 같은 점수를 길드 공동 토큰에 더한다", async () => {
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 2 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.delivered).toEqual({
      itemName: "소나무 원목",
      quantity: 20,
      points: 2,
      tokensGained: 4,
      completed: false,
      contributionPoints: 20,
    });
    expect(json.tokens).toBe(4);
    expect(json.contribution.points).toBe(2);
    expect(consume).toHaveBeenCalledWith(20);
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        progress: { [CONTRACT_ID]: 2 },
        tokens: 4,
      }),
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      GUILD_TRADE_USER_SAVE_KEY,
      expect.objectContaining({ tokens: 0, contributionPoints: 2 }),
    );
  });

  it("주간 목표 명단이 확정된 뒤 가입해도 협회 사용 이력이 없으면 납품한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 0, []));

    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 1 }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).delivered).toMatchObject({
      quantity: 10,
      points: 1,
    });
  });

  it("마지막 납품으로 계약을 완료하면 시설 보너스가 적용된 길드 보상을 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(39));
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.guildReward).toEqual({ gold: 2_250_000, fame: 150 });
    expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
      gold: 7_250_000,
    });
    expect(addGuildFame).toHaveBeenCalledWith(expect.anything(), 7, 150);
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
    expect(json.delivered).toMatchObject({
      points: 8,
      tokensGained: 17,
      completed: true,
    });
    expect(json.contracts[0]).toMatchObject({ progress: 50, completed: true });
    expect(json.tokens).toBe(17);
  });

  it("개인 주간 납품 한도를 넘는 요청은 아이템을 소비하지 않는다", async () => {
    vi.mocked(lockSaveForUpdate).mockResolvedValue(userState({ contributionPoints: 300 }));
    const response = await POST(
      request({ action: "deliver", contractId: CONTRACT_ID, batches: 1 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("contribution_cap");
    expect(consume).not.toHaveBeenCalled();
  });

  it("공동 구매 횟수와 전원 지급 인원을 길드 활동에 기록한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState({ tokens: 0 });
      if (key === "character.v2") return { materials: {} };
      return {};
    });
    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(80);
    expect(json.purchased).toEqual({
      itemId: "refined_iron",
      itemName: "정제 철괴",
      quantity: 1,
      tokenCost: 20,
      remainingTokens: 80,
      recipientCount: 2,
    });
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      "character.v2",
      { materials: { [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1 } },
    );
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokens: 80,
        purchases: { refined_iron: 1 },
      }),
    );
    expect(logGuildActivity).toHaveBeenCalledWith(
      expect.anything(),
      {
        guildId: 7,
        type: "trade_shop_purchase",
        actorUserId: "u-trader",
        meta: {
          itemName: "정제 철괴",
          quantity: 1,
          tokenCost: 20,
          remainingTokens: 80,
          recipientCount: 2,
        },
      },
    );
  });

  it("기존 개인 토큰은 공동 잔고에 한 번 합친 뒤 개인 잔고를 비운다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 10));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState({ tokens: 15 });
      if (key === "character.v2") return { materials: {} };
      return {};
    });

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tokens).toBe(5);
    expect(saveGuildTradeWeekly).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ tokens: 25 }),
    );
    expect(saveGuildTradeWeekly).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ tokens: 5 }),
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      GUILD_TRADE_USER_SAVE_KEY,
      expect.objectContaining({ tokens: 0 }),
    );
  });
});
