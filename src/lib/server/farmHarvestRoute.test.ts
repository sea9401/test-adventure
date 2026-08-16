import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, incrementGuildExplorationProgressForUser, rewardReferralTutorialTasks } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  incrementGuildExplorationProgressForUser: vi.fn(async () => null),
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [] as string[],
    completedTaskIds: [] as string[],
  })),
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
vi.mock("@/lib/server/referrals", () => ({ rewardReferralTutorialTasks }));
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
  farmingLevelXpThreshold,
  plantCrop,
  type FarmState,
} from "@/adventure/v2/farm";
import { ranchReadyPenCount } from "@/adventure/v2/ranch";
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
    rewardReferralTutorialTasks.mockClear();
    resetUserRateLimitForTests();
    vi.restoreAllMocks();
  });

  it("구 초과 XP를 한 번 환산한 뒤 이번 수확 XP를 저장한다", async () => {
    const planted = plantCrop(
      emptyFarmState(NOW),
      "plot-1",
      "wheat",
      NOW - FARM_CROPS.wheat.growMs - 1,
    );
    store.set(FARM_SAVE_KEY, {
      ...planted,
      levelCurveVersion: undefined,
      stats: { ...planted.stats, farmingXp: 999_999 },
    });
    store.set("character.v2", {});
    store.set("skills.v2", {});

    const response = await POST(
      new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.levelCurveMigrated).toBe(true);
    expect(store.get(FARM_SAVE_KEY)).toMatchObject({
      levelCurveVersion: 2,
      stats: { farmingXp: farmingLevelXpThreshold(60) + 30 },
    });
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
      stats: {
        ...planted.stats,
        harvests: 7,
        farmingXp: farmingLevelXpThreshold(5),
      },
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
    expect(rewardReferralTutorialTasks).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      "새 모험가",
      ["life_level_5"],
    );
  });

  it("작물을 수확해도 응답의 목장 수확 가능 배지를 유지한다", async () => {
    const planted = plantCrop(
      emptyFarmState(NOW),
      "plot-1",
      "wheat",
      NOW - FARM_CROPS.wheat.growMs - 1,
    );
    const ranchStartedAt = NOW - 2 * 60 * 60 * 1_000;
    store.set(FARM_SAVE_KEY, {
      ...planted,
      ranch: {
        ...planted.ranch,
        pens: {
          ...planted.ranch.pens,
          "coop-1": {
            ...planted.ranch.pens["coop-1"],
            feed: 1,
            lastSettledAt: ranchStartedAt,
          },
          "coop-2": {
            ...planted.ranch.pens["coop-2"],
            unlocked: true,
            feed: 1,
            lastSettledAt: ranchStartedAt,
          },
        },
      },
    });
    store.set("character.v2", {});
    store.set("skills.v2", {});

    const response = await POST(
      new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { farm: FarmState };
    expect(ranchReadyPenCount(body.farm.ranch)).toBe(2);
  });
});
