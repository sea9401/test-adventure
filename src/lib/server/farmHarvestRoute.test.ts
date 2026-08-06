import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, incrementGuildExplorationProgressForUser } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  incrementGuildExplorationProgressForUser: vi.fn(async () => null),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/lifeGatheringTelemetry", () => ({
  recordLifeGatheringTelemetrySoon: vi.fn(),
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationProgressForUser,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.for = () => query;
      query.limit = async () => [];
      query.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve);
      return callback({ select: vi.fn(() => query) });
    }),
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

import { POST } from "@/app/api/v2/farm/harvest/route";
import {
  FARM_CROPS,
  FARM_SAVE_KEY,
  emptyFarmState,
  plantCrop,
  type FarmState,
} from "@/adventure/v2/farm";
import {
  deriveRepeatViews,
  kstDailyKey,
  kstWeeklyKey,
  parseRepeatSave,
} from "@/adventure/data/v2/v2RepeatQuests";
import {
  REPEAT_QUESTS_KEY,
  buildRepeatSignals,
} from "@/lib/server/v2QuestContext";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";

const NOW = 1_800_014_400_000;

describe("POST /api/v2/farm/harvest", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    store.clear();
    incrementGuildExplorationProgressForUser.mockClear();
    resetUserRateLimitForTests();
    vi.restoreAllMocks();
  });

  it("자정 뒤 첫 수확 전에 일일 퀘스트 기준값을 갱신한다", async () => {
    const planted = plantCrop(
      emptyFarmState(NOW),
      "plot-1",
      "wheat",
      NOW - FARM_CROPS.wheat.growMs - 1,
    );
    store.set(FARM_SAVE_KEY, {
      ...planted,
      stats: { ...planted.stats, harvests: 7 },
    });
    store.set("character.v2", {});
    store.set("skills.v2", {});

    const baseline = {
      battleCount: 0,
      fishCaught: 0,
      enhanceAttempts: 0,
      farmHarvests: 7,
      woodcuttingCuts: 0,
      miningSuccesses: 0,
      workshopCrafts: 0,
    };
    store.set(REPEAT_QUESTS_KEY, {
      daily: {
        key: kstDailyKey(new Date(NOW - 24 * 3600_000)),
        baseline,
        claimed: ["d_farm"],
      },
      weekly: {
        key: kstWeeklyKey(new Date(NOW)),
        baseline,
        claimed: [],
      },
    });

    const response = await POST(
      new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }),
    );

    expect(response.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    expect(farm.stats.harvests).toBe(8);

    const repeat = parseRepeatSave(store.get(REPEAT_QUESTS_KEY));
    expect(repeat.daily).toMatchObject({
      key: kstDailyKey(new Date(NOW)),
      baseline: { farmHarvests: 7 },
      claimed: [],
    });
    const signals = buildRepeatSignals({}, {
      hasGuild: false,
      hasTraded: false,
      arenaPlayed: false,
      arenaWins: 0,
      guildDiningMeals: 0,
      guildTrainingDrills: 0,
      guildExpeditions: 0,
      guildWorkshopDeliveries: 0,
      guildAlchemyCrafts: 0,
      guildTradeContracts: 0,
      fishSpecies: 0,
      fishCaught: 0,
      arenaTimes: [],
    }, { farmRaw: farm });
    expect(deriveRepeatViews(repeat, signals).find((quest) => quest.id === "d_farm")?.progress).toBe(1);
  });
});
