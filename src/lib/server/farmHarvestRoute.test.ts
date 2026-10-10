import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

const { store, incrementGuildExplorationProgressForUser, rewardReferralTutorialTasks, recordCodexMasteryGameplayBatch } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  incrementGuildExplorationProgressForUser: vi.fn(async () => null),
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [] as string[],
    completedTaskIds: [] as string[],
  })),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
}));

const { masterProductNotify } = vi.hoisted(() => ({
  masterProductNotify: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationWith: masterProductNotify,
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
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
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
import { LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";
import {
  FARM_CROPS,
  FARM_SAVE_KEY,
  emptyFarmState,
  farmingLevelXpThreshold,
  plantCrop,
  type FarmState,
} from "@/adventure/v2/farm";
import { ranchReadySlotCount } from "@/adventure/v2/ranch";
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

const { festivalBonus } = vi.hoisted(() => ({
  festivalBonus: vi.fn(),
}));
vi.mock("@/adventure/v2/lifeFestival", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/v2/lifeFestival")>()),
  lifeFestivalBonus: festivalBonus,
}));
beforeEach(() => {
  festivalBonus.mockReset();
  festivalBonus.mockReturnValue({ themeId: null, chancePct: 0, xpPct: 0 });
});

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
    recordCodexMasteryGameplayBatch.mockClear();
    resetUserRateLimitForTests();
    vi.restoreAllMocks();
  });

  it("반환된 씨앗을 농장에 저장하고 수확 결과로 전달한다", async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const initial = emptyFarmState(NOW);
    initial.seeds = { wheat: 1, herb: 2 };
    store.set(FARM_SAVE_KEY, plantCrop(initial, "plot-1", "wheat", NOW - FARM_CROPS.wheat.growMs - 1));
    store.set("character.v2", {});
    store.set("skills.v2", {});
    const response = await POST(new Request("http://test.local/api/v2/farm/harvest", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plotId: "plot-1" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { seedReturned: 1 } });
    expect(store.get(FARM_SAVE_KEY)).toMatchObject({ seeds: { wheat: 1, herb: 2 } });
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

  it("농부의 성공한 수확 XP를 직업 도감 숙련도로 기록한다", async () => {
    const planted = plantCrop(
      emptyFarmState(NOW),
      "plot-1",
      "wheat",
      NOW - FARM_CROPS.wheat.growMs - 1,
    );
    store.set(FARM_SAVE_KEY, planted);
    store.set("character.v2", {
      class: "survivor",
      specChoice: "farmer",
    });
    store.set("skills.v2", {});
    store.set("proficiency.v2", {
      groups: { survivor: { tier: 1, cumLevel: 900 } },
      jobCumLevel: { farmer: 10 },
    });

    const response = await POST(
      new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      farmJobId: "farmer",
      masteryGained: 30,
      masteryAfter: 40,
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "farmer",
        amount: 30,
        source: "job.activity",
      }],
      new Date(NOW),
    );
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
      referralCount: 0,
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
        slots: {
          ...planted.ranch.slots,
          "slot-1": {
            ...planted.ranch.slots["slot-1"],
            feed: 1,
            lastSettledAt: ranchStartedAt,
          },
          "slot-2": {
            ...planted.ranch.slots["slot-2"],
            unlocked: true,
            animalId: "chicken",
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
    expect(ranchReadySlotCount(body.farm.ranch)).toBe(2);
  });
  it("수확제 주간에는 수확량 보너스 10%와 농사 경험치 25%를 더한다", async () => {
    const harvest = async () => {
      store.set(
        FARM_SAVE_KEY,
        plantCrop(emptyFarmState(NOW), "plot-1", "wheat", NOW - FARM_CROPS.wheat.growMs - 1),
      );
      store.set("character.v2", {});
      store.set("skills.v2", {});
      resetUserRateLimitForTests();
      const response = await POST(new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }));
      expect(response.status).toBe(200);
      return {
        json: await response.json(),
        farm: store.get(FARM_SAVE_KEY) as { stats: { farmingXp: number; yieldBonusRemainderPct: number } },
      };
    };
    const base = await harvest();
    store.clear();
    festivalBonus.mockReturnValue({ themeId: "harvest", chancePct: 10, xpPct: 25 });
    const boosted = await harvest();

    expect(festivalBonus).toHaveBeenCalledWith("farming", new Date(NOW));
    const baseGain = base.json.result.farmingXpGained;
    expect(boosted.json.result.farmingXpGained).toBe(baseGain + Math.floor(baseGain * 0.25));
    expect(boosted.farm.stats.farmingXp).toBe(base.farm.stats.farmingXp + Math.floor(baseGain * 0.25));
    expect(boosted.json.result.quantity * 100 + boosted.farm.stats.yieldBonusRemainderPct).toBeGreaterThan(
      base.json.result.quantity * 100 + base.farm.stats.yieldBonusRemainderPct,
    );
  });


  describe("생활 전공", () => {
    const harvestAtCap = async (lifeMajor: unknown) => {
      store.clear();
      resetUserRateLimitForTests();
      const planted = plantCrop(emptyFarmState(NOW), "plot-1", "wheat", NOW - FARM_CROPS.wheat.growMs - 1);
      store.set(FARM_SAVE_KEY, {
        ...planted,
        levelCurveVersion: 2,
        stats: { ...planted.stats, farmingXp: farmingLevelXpThreshold(100) },
      });
      store.set("character.v2", { materials: { v2_master_crop: 1 } });
      store.set("skills.v2", {});
      if (lifeMajor) store.set(LIFE_MAJOR_SAVE_KEY, lifeMajor);
      const response = await POST(new Request("http://test.local/api/v2/farm/harvest", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ plotId: "plot-1" }),
      }));
      expect(response.status).toBe(200);
      return response.json();
    };

    it("농사 주전공이면 Lv.100에서 넘친 경험치를 명장 경험치로 쌓고 명장 작물을 지급한다", async () => {
      vi.mocked(Math.random).mockReturnValue(0);
      const stage3 = lifeMajorStageXp("farming", 3);
      const json = await harvestAtCap({ major: "farming", masteryXp: { farming: stage3 } });

      const gained = json.result.farmingXpGained;
      expect(gained).toBeGreaterThan(0);
      expect(json.lifeMajor).toEqual({
        masteryXpGained: gained,
        masterProduct: { materialId: "v2_master_crop", name: "명장 작물", count: 1 },
      });
      expect(store.get(LIFE_MAJOR_SAVE_KEY)).toMatchObject({ masteryXp: { farming: stage3 + gained } });
      expect(store.get("character.v2")).toMatchObject({ materials: { v2_master_crop: 2 } });
      expect(masterProductNotify).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        "master_product",
        { activity: "farming", materialId: "v2_master_crop", name: "명장 작물", count: 1 },
      );
    });

    it("비전공이면 명장 경험치와 산물이 없다", async () => {
      vi.mocked(Math.random).mockReturnValue(0);
      const json = await harvestAtCap({ major: "fishing", masteryXp: { fishing: 10 } });
      expect(json.lifeMajor).toEqual({ masteryXpGained: 0, masterProduct: null });
      expect(store.get("character.v2")).toEqual({ materials: { v2_master_crop: 1 } });
    });

    it("주전공 단계만큼 수확량 보너스를 더한다", async () => {
      const remainder = async (lifeMajor: unknown) => {
        await harvestAtCap(lifeMajor);
        return (store.get(FARM_SAVE_KEY) as { stats: { yieldBonusRemainderPct: number } }).stats
          .yieldBonusRemainderPct;
      };
      const base = await remainder(null);
      const boosted = await remainder({
        major: "farming",
        masteryXp: { farming: lifeMajorStageXp("farming", 3) },
      });
      expect(boosted).toBeGreaterThan(base);
    });
  });

});
