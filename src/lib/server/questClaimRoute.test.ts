import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/v2QuestContext", () => ({
  GUIDE_QUESTS_KEY: "guide-quests.v2",
  assembleQuestExtras: vi.fn(async () => ({
    hasGuild: false,
    hasTraded: false,
    arenaPlayed: false,
    arenaWins: 0,
    claimAttempted: false,
    hasOutpost: false,
    siegeWins: 0,
    siegeAttempts: 0,
    fishCaught: 0,
    arenaTimes: [],
    fishSpecies: 0,
    antiquesFound: 0,
  })),
  buildQuestCtx: vi.fn(({ charRaw }) => ({
    class: "none",
    level: 1,
    tier: 1,
    battleCount: 0,
    frontierDepth: 2,
    equippedCount: 0,
    uniqueOwned: 0,
    cultivations: 0,
    bossKills: 0,
    hasGuild: false,
    hasTraded: false,
    arenaPlayed: false,
    arenaWins: 0,
    gold: Number((charRaw as { gold?: number }).gold ?? 0),
    outpostsDiscovered: 0,
    titleCount: 0,
    cumLevel: 0,
    reincarnations: 0,
    speciesKilled: 0,
    claimAttempted: false,
    hasOutpost: false,
    siegeWins: 0,
    warCaptures: 0,
    warEjectWins: 0,
    warTreasuryGold: 0,
    fishSpecies: 0,
    antiquesFound: 0,
    maxEnhanceLevel: 0,
    enhanceStones: 0,
    bankedGold: Number((charRaw as { bankedGold?: number }).bankedGold ?? 0),
    skillsEquipped: 0,
    skillsLearned: 0,
    hasHealed: false,
    hasShopped: false,
    hasMoved: false,
    workshopCrafts: 0,
    workshopQualityCrafts: 0,
    blacksmithLevel: 1,
  })),
  parseClaimed: vi.fn((raw: { claimed?: unknown } | undefined) =>
    new Set(Array.isArray(raw?.claimed) ? raw.claimed : []),
  ),
}));

vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/v2/me/quests/claim/route";

function claimReq(questId: string): Request {
  return new Request("http://t/api/v2/me/quests/claim", {
    method: "POST",
    body: JSON.stringify({ questId }),
  });
}

describe("POST /api/v2/me/quests/claim", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", { gold: 10_000, bankedGold: 250 });
    store.set("equipment.v2", { owned: [], equipped: {} });
    store.set("guide-quests.v2", { claimed: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("가이드 퀘스트 골드 보상은 보유 골드가 아니라 은행으로 입금한다", async () => {
    const res = await POST(claimReq("x_rich"));
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      ok: boolean;
      reward: { gold: number };
      gold: number;
      bankedGold: number;
    };
    expect(json.ok).toBe(true);
    expect(json.reward.gold).toBe(800);
    expect(json.gold).toBe(10_000);
    expect(json.bankedGold).toBe(1_050);

    const char = store.get("character.v2") as {
      gold: number;
      bankedGold: number;
    };
    expect(char.gold).toBe(10_000);
    expect(char.bankedGold).toBe(1_050);
  });
});
