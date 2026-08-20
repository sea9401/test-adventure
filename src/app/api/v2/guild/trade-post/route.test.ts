import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUILD_TRADE_USER_SAVE_KEY } from "@/adventure/data/v2/guildTrade";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
import { kstWeekMondayKey } from "@/lib/kst";

const tradeMocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  const state = {
    actorRestricted: false,
    restrictedRecipients: new Set<string>(),
  };
  return {
    TradeSuspendedError,
    state,
    requireTradeParticipants: vi.fn(async () => {
      if (state.actorRestricted) throw new TradeSuspendedError();
    }),
    lockTradeParticipantStatuses: vi.fn(
      async (_tx: unknown, userIds: readonly string[]) =>
        new Map(
          userIds.map((userId) => [
            userId,
            (state.actorRestricted && userId === "u-trader") ||
            state.restrictedRecipients.has(userId)
              ? {
                  source: "trade" as const,
                  reason: "test",
                  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
                  permanent: false,
                }
              : null,
          ]),
        ),
    ),
  };
});

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
    select: (fields?: Record<string, unknown>) => tx.select(fields),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-trader"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 7),
  getGuildIdByUser: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/settlementBuildingAccess", () => ({
  buildingLevelFromSlots: vi.fn(
    (_buildings: unknown, buildingId: string) =>
      buildingId === "trade_post" ? 3 : buildingId === "guild_smithy" ? 1 : 0,
  ),
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
vi.mock("@/lib/server/v2Settlement", () => ({
  lockGuildSettlementBuilding: vi.fn(async () => ({
    slot: 0,
    village: {
      buildings: { 0: { id: "guild_smithy", level: 1 } },
    },
  })),
}));
vi.mock("@/lib/server/guildFacilityUpgradeDonations", () => ({
  readGuildFacilityDonationProgress: vi.fn(async () => ({
    guild_smithy: {
      targetLevel: 2,
      materials: { crop: 20, ore: 30 },
    },
  })),
  lockGuildFacilityDonationProgress: vi.fn(async () => ({ crop: 20, ore: 30 })),
  setGuildFacilityDonationProgress: vi.fn(async () => undefined),
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
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: tradeMocks.TradeSuspendedError,
  requireTradeParticipants: tradeMocks.requireTradeParticipants,
  lockTradeParticipantStatuses: tradeMocks.lockTradeParticipantStatuses,
  tradeSuspendedResponse: () =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
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
import { lockGuildSettlementBuilding } from "@/lib/server/v2Settlement";
import {
  lockGuildFacilityDonationProgress,
  readGuildFacilityDonationProgress,
  setGuildFacilityDonationProgress,
} from "@/lib/server/guildFacilityUpgradeDonations";
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
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
  tradeMocks.state.actorRestricted = false;
  tradeMocks.state.restrictedRecipients.clear();
  vi.mocked(isGuildMasterOrManager).mockResolvedValue(true);
  vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly());
  vi.mocked(lockGuildTradeItem).mockResolvedValue({ owned: 100, consume });
  vi.mocked(readGuildTradeItemBalances).mockResolvedValue({ [CONTRACT_ID]: 100 });
  vi.mocked(lockGuildSettlementBuilding).mockResolvedValue({
    slot: 0,
    village: {
      buildings: { 0: { id: "guild_smithy", level: 1 } },
    },
  } as unknown as Awaited<ReturnType<typeof lockGuildSettlementBuilding>>);
  vi.mocked(readGuildFacilityDonationProgress).mockResolvedValue({
    guild_smithy: {
      targetLevel: 2,
      materials: { crop: 20, ore: 30 },
    },
  });
  vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
    crop: 20,
    ore: 30,
  });
  vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
    if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
    return {};
  });
});

describe("길드 교역소", () => {
  it.each([
    [
      "납품",
      { action: "deliver", contractId: CONTRACT_ID, batches: 1 },
      ["u-trader"],
    ],
    [
      "구매",
      { action: "buy", shopItemId: "refined_iron" },
      ["u-member", "u-trader"],
    ],
  ])("거래 정지 actor의 %s를 길드·자산 잠금 전에 차단한다", async (_label, body, participantIds) => {
    tradeMocks.state.actorRestricted = true;

    const response = await POST(request(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "trade_suspended",
    });
    expect(tradeMocks.lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      participantIds,
      expect.any(Date),
    );
    expect(getGuildId).not.toHaveBeenCalled();
    expect(lockGuildTradeWeekly).not.toHaveBeenCalled();
    expect(lockGuildTradeItem).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("길드 전원 지급에서 거래 정지 멤버만 제외하고 나머지에게 지급한다", async () => {
    mockRecipientIds = ["u-trader", "u-suspended", "u-member"];
    tradeMocks.state.restrictedRecipients.add("u-suspended");
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
      if (key === "character.v2") return { materials: {} };
      return {};
    });

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.purchased).toMatchObject({ recipientCount: 2 });
    expect(tradeMocks.lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      ["u-member", "u-suspended", "u-trader"],
      expect.any(Date),
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      "character.v2",
      expect.anything(),
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-member",
      "character.v2",
      expect.anything(),
    );
    expect(upsertSave).not.toHaveBeenCalledWith(
      expect.anything(),
      "u-suspended",
      expect.anything(),
      expect.anything(),
    );
  });

  it("역순 멤버 ID도 actor와 함께 잠근 뒤 weekly와 모든 save를 잠근다", async () => {
    mockRecipientIds = ["u-z-member", "u-trader", "u-a-member"];
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
    expect(tradeMocks.lockTradeParticipantStatuses).toHaveBeenCalledTimes(1);
    expect(tradeMocks.lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      ["u-a-member", "u-trader", "u-z-member"],
      expect.any(Date),
    );
    expect(
      tradeMocks.lockTradeParticipantStatuses.mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(lockGuildTradeWeekly).mock.invocationCallOrder[0],
    );
    expect(
      tradeMocks.lockTradeParticipantStatuses.mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(lockSaveForUpdate).mock.invocationCallOrder[0]);
  });

  it("지급 대상 길드원이 모두 거래 정지면 토큰과 grant 자산을 잠그지 않는다", async () => {
    mockRecipientIds = ["u-z-member", "u-a-member"];
    tradeMocks.state.restrictedRecipients.add("u-a-member");
    tradeMocks.state.restrictedRecipients.add("u-z-member");
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));

    const response = await POST(
      request({ action: "buy", shopItemId: "refined_iron" }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("no_recipients");
    expect(lockGuildTradeWeekly).not.toHaveBeenCalled();
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
    expect(saveGuildTradeWeekly).not.toHaveBeenCalled();
  });

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

  it("지원 가능한 시설과 구매 후 진행도를 미리 보여준다", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.facilitySupportTargets).toContainEqual(
      expect.objectContaining({
        buildingId: "guild_smithy",
        buildingName: "제작소",
        currentLevel: 1,
        targetLevel: 2,
        eligible: true,
        reason: null,
        crop: { current: 20, required: 500, grant: 100, after: 120 },
        ore: { current: 30, required: 500, grant: 100, after: 130 },
      }),
    );
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

  it("교역 토큰 상점에서 구매한 스태미나 회복약을 길드원에게 귀속 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 100));
    vi.mocked(lockSaveForUpdate).mockImplementation(async (_tx, _userId, key) => {
      if (key === GUILD_TRADE_USER_SAVE_KEY) return userState();
      if (key === "stamina-potions.v1") return { count: 2, boundCount: 1 };
      return {};
    });

    const response = await POST(
      request({ action: "buy", shopItemId: "stamina_potion" }),
    );

    expect(response.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-trader",
      "stamina-potions.v1",
      { count: 3, boundCount: 2 },
    );
    expect(upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "u-member",
      "stamina-potions.v1",
      { count: 3, boundCount: 2 },
    );
  });

  it("시설 지원 물자를 선택한 시설 공동 기부 진행도에 적용한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));

    const response = await POST(
      request({
        action: "buy",
        shopItemId: "settlement_supplies",
        facilityId: "guild_smithy",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(setGuildFacilityDonationProgress).toHaveBeenCalledWith(
      expect.anything(),
      7,
      "guild_smithy",
      2,
      {
        crop: 120,
        ore: 130,
      },
    );
    expect(json.purchased.facilitySupport).toEqual({
      buildingId: "guild_smithy",
      buildingName: "제작소",
      targetLevel: 2,
      crop: 100,
      ore: 100,
    });
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokens: 380,
        purchases: { settlement_supplies: 1 },
      }),
    );
    expect(upsertSave).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "character.v2",
      expect.anything(),
    );
  });

  it("확인 뒤 남은 기초 재료가 200개 미만이면 구매를 롤백한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));
    vi.mocked(lockGuildFacilityDonationProgress).mockResolvedValue({
      crop: 450,
      ore: 400,
    });

    const response = await POST(
      request({
        action: "buy",
        shopItemId: "settlement_supplies",
        facilityId: "guild_smithy",
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("facility_support_unavailable");
    expect(setGuildFacilityDonationProgress).not.toHaveBeenCalled();
    expect(saveGuildTradeWeekly).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purchases: { settlement_supplies: 1 } }),
    );
  });

  it("시설 지원 물자 구매에는 유효한 시설 ID가 필요하다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));

    const response = await POST(
      request({ action: "buy", shopItemId: "settlement_supplies" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "invalid_facility_support_target",
    );
  });

  it("교역 지원금을 길드 공용 자금에 한 번 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));

    const response = await POST(
      request({ action: "buy", shopItemId: "trade_support_fund" }),
    );

    expect(response.status).toBe(200);
    expect(upsertGuildResources).toHaveBeenCalledWith(expect.anything(), 7, {
      gold: 8_000_000,
    });
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tokens: 320 }),
    );
  });

  it("길드 명성 문서를 길드 명성에 한 번 지급한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue(weekly(0, 500));

    const response = await POST(
      request({ action: "buy", shopItemId: "guild_fame_document" }),
    );

    expect(response.status).toBe(200);
    expect(addGuildFame).toHaveBeenCalledWith(expect.anything(), 7, 100);
    expect(saveGuildTradeWeekly).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tokens: 300 }),
    );
  });

  it("품목 구매 한도는 관리자 개인이 아니라 길드 전체에 적용한다", async () => {
    vi.mocked(lockGuildTradeWeekly).mockResolvedValue({
      ...weekly(0, 100),
      purchases: { refined_iron: 7 },
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
