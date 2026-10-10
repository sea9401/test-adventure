import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSOCIATION_TRADE_USER_SAVE_KEY,
  GUILD_TRADE_USER_SAVE_KEY,
} from "@/adventure/data/v2/guildTrade";
import { tradePostUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { kstWeekMondayKey } from "@/lib/kst";

const tx = {};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-solo"),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  associationFacilityLevel: vi.fn(async () => 3),
  canUseAdventurerAssociation: vi.fn(async () => true),
}));
vi.mock("@/lib/server/adventurerAssociationTrade", () => ({
  lockAssociationTradeWeekly: vi.fn(),
  saveAssociationTradeWeekly: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildTradeInventory", () => ({
  lockGuildTradeItem: vi.fn(),
  readGuildTradeItemBalances: vi.fn(async () => ({})),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({})),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

import { lockAssociationTradeWeekly } from "@/lib/server/adventurerAssociationTrade";
import { lockGuildTradeItem } from "@/lib/server/guildTradeInventory";
import { readSave, upsertSave } from "@/lib/server/savesKv";
import { GET, POST } from "./route";

const CONTRACT_ID = "material:v2_timber";
const consume = vi.fn(async () => undefined);
const cap = tradePostUpgradeForLevel(3).personalContributionCap;

function deliver(batches: number) {
  return POST(
    new Request("http://localhost/api/v2/association/trade-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deliver", contractId: CONTRACT_ID, batches }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAssociationTradeWeekly).mockResolvedValue({
    weekKey: kstWeekMondayKey(),
    contractIds: [CONTRACT_ID],
    progress: {},
    completedIds: [],
    target: 10_000,
  });
  vi.mocked(lockGuildTradeItem).mockResolvedValue({ owned: 100, consume });
  vi.mocked(readSave).mockImplementation(async (_tx, _userId, key, fallback) =>
    key === GUILD_TRADE_USER_SAVE_KEY
      ? { guildId: 7, weekKey: kstWeekMondayKey(), contributionPoints: cap - 1 }
      : fallback,
  );
});

describe("협회 교역소", () => {
  it("같은 주에 길드 교역소에서 납품한 점수만큼 협회 개인 납품 한도가 줄어든다", async () => {
    const view = await (await GET()).json();
    expect(view).toMatchObject({
      eligible: true,
      contribution: { points: cap - 1, remaining: 1 },
    });

    const blocked = await deliver(2);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toBe("contribution_cap");
    expect(consume).not.toHaveBeenCalled();

    const delivered = await deliver(1);
    expect(delivered.status).toBe(200);
    expect(upsertSave).toHaveBeenCalledWith(
      tx,
      "u-solo",
      ASSOCIATION_TRADE_USER_SAVE_KEY,
      expect.objectContaining({ contributionPoints: 1 }),
    );
  });
});
