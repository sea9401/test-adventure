// 낚시 reel 라우트 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리하고 라우트 본문은 REAL 코드로 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, upsertFishingRecord, incrementGuildExplorationProgressForUser } =
  vi.hoisted(() => ({
    store: new Map<string, unknown>(),
    upsertFishingRecord: vi.fn(async () => {}),
    incrementGuildExplorationProgressForUser: vi.fn(async () => null),
  }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/fishing/records", () => ({
  upsertFishingRecord,
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationProgressForUser,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.for = () => query;
      query.limit = async () => [];
      query.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve);
      return cb({ select: vi.fn(() => query) });
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

import { POST } from "@/app/api/v2/fishing/reel/route";
import { POST as CAST } from "@/app/api/v2/fishing/cast/route";
import { FISHING_SESSION_KEY } from "@/adventure/v2/fishingSession";
import { FISHING_ANTI_MACRO_KEY } from "@/adventure/v2/fishingAntiMacro";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { FISHING_STREAK_KEY } from "@/adventure/v2/fishingStreak";
import { FISHING_STOCK_KEY } from "@/adventure/v2/fishingStock";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
} from "@/adventure/v2/fishingProgression";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import {
  kstDailyKey,
  kstWeeklyKey,
} from "@/adventure/data/v2/v2RepeatQuests";
import { REPEAT_QUESTS_KEY } from "@/lib/server/v2QuestContext";
import { MINING_AUTO_KEY } from "@/adventure/v2/autoGathering";

function reelReq(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/fishing/reel", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seedFisherSession(now: number) {
  store.clear();
  upsertFishingRecord.mockClear();
  incrementGuildExplorationProgressForUser.mockClear();
  store.set("character.v2", {
    class: "survivor",
    specChoice: "fisher",
  });
  store.set("proficiency.v2", {
    points: 123,
    groups: { survivor: { tier: 1, cumLevel: 10, cultivations: 0 } },
    grown: {},
    jobCumLevel: { fisher: 5 },
  });
  store.set(FISHING_SESSION_KEY, {
    castId: "cast-1",
    biteAt: now - 100,
    expiresAt: now + 10_000,
    fishId: "carp",
    size: 42,
  });
  store.set(FISHING_CODEX_KEY, { fish: {} });
  store.set(FISHING_WALLET_KEY, { coins: 0 });
  const baseline = {
    battleCount: 0,
    siegeAttempts: 0,
    siegeWins: 0,
    warTreasuryGold: 0,
    fishCaught: 0,
    enhanceAttempts: 0,
  };
  const date = new Date(now);
  store.set(REPEAT_QUESTS_KEY, {
    daily: {
      key: kstDailyKey(date),
      baseline,
      claimed: [],
    },
    weekly: {
      key: kstWeeklyKey(date),
      baseline,
      claimed: [],
    },
  });
}

describe("POST /api/v2/fishing/reel", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_014_400_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("자동 채광 중에는 캐스팅과 챔질을 모두 거부한다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: "v2_iron_ore",
        startedAt: now,
        readyAt: now + 30 * 60_000,
        cycleDurationMs: 7_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });

    const castResponse = await CAST(
      new Request("http://t/api/v2/fishing/cast", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(castResponse.status).toBe(409);
    await expect(castResponse.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });

    const reelResponse = await POST(
      reelReq({ castId: "cast-1", reactionMs: 200 }),
    );
    expect(reelResponse.status).toBe(409);
    await expect(reelResponse.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });
    expect(store.get(FISHING_SESSION_KEY)).toMatchObject({ castId: "cast-1" });
  });

  it("낚시 계열 직업은 성공한 챔질로 직업 숙련도가 오른다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    vi.mocked(Math.random).mockReturnValueOnce(0.05);

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      caught: boolean;
      masteryGained: number;
      masteryAfter: number | null;
      fishingXpGained: number;
      fishingLevel: number;
      fishingCatches: number;
      catchItem: { id: string; name: string; quantity: number; balance: number };
    };
    expect(json.ok).toBe(true);
    expect(json.caught).toBe(true);
    expect(json.fishingXpGained).toBe(4);
    expect(json.fishingLevel).toBe(1);
    expect(json.fishingCatches).toBe(1);
    expect(json.masteryGained).toBe(1);
    expect(json.masteryAfter).toBe(6);
    expect(json.catchItem).toEqual({
      id: "catch_fresh",
      name: "신선한 어획물",
      icon: "🐠",
      quantity: 1,
      balance: 1,
      dailyAwarded: 1,
      dailyCap: 30,
    });

    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: { survivor?: { cumLevel?: number } };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(123);
    expect(prof.groups.survivor?.cumLevel).toBe(11);
    expect(prof.jobCumLevel?.fisher).toBe(6);
    expect(store.get(FISHING_PROGRESS_KEY)).toMatchObject({
      xp: 4,
      catches: 1,
      equippedRodId: "reed_rod",
      equippedLureId: "dough_lure",
    });
    expect(store.get(FISHING_SESSION_KEY)).toEqual({});
    expect(store.get(FISHING_STOCK_KEY)).toEqual({
      version: 1,
      items: { catch_fresh: 1 },
      daily: {
        date: kstDailyKey(new Date(now)),
        awarded: { catch_fresh: 1 },
      },
    });
    expect(upsertFishingRecord).toHaveBeenCalledOnce();
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "fishing",
      ).completedSinceVerification,
    ).toBe(1);
  });

  it("다른 직업으로 낚시해도 낚시꾼 전직용 생존자 숙련도가 오른다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set("character.v2", {
      class: "mage",
      specChoice: null,
    });
    store.set("proficiency.v2", {
      points: 123,
      groups: {
        mage: { tier: 1, cumLevel: 20, cultivations: 0 },
        survivor: { tier: 1, cumLevel: 10, cultivations: 0 },
      },
      grown: {},
      jobCumLevel: { fisher: 5 },
    });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      caught: boolean;
      masteryGained: number;
      masteryAfter: number | null;
    };
    expect(json).toMatchObject({
      ok: true,
      caught: true,
      masteryGained: 1,
      masteryAfter: 11,
    });

    const prof = store.get("proficiency.v2") as {
      points: number;
      groups: {
        mage?: { cumLevel?: number };
        survivor?: { cumLevel?: number };
      };
      jobCumLevel?: Record<string, number>;
    };
    expect(prof.points).toBe(123);
    expect(prof.groups.mage?.cumLevel).toBe(20);
    expect(prof.groups.survivor?.cumLevel).toBe(11);
    expect(prof.jobCumLevel?.fisher).toBe(5);
  });

  it("자정 뒤 첫 낚시 전에 일일 퀘스트 기준값을 갱신한다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(FISHING_CODEX_KEY, {
      fish: {
        carp: {
          discovered: true,
          bestSize: 40,
          totalCaught: 7,
          firstCaughtAt: now - 100_000,
          bestCaughtAt: now - 100_000,
        },
      },
    });
    const repeat = store.get(REPEAT_QUESTS_KEY) as {
      daily: { key: string };
      weekly: unknown;
    };
    store.set(REPEAT_QUESTS_KEY, {
      ...repeat,
      daily: {
        key: kstDailyKey(new Date(now - 24 * 3600_000)),
        baseline: {
          battleCount: 0,
          siegeAttempts: 0,
          siegeWins: 0,
          warTreasuryGold: 0,
          fishCaught: 4,
          enhanceAttempts: 0,
        },
        claimed: ["d_fish"],
      },
    });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));

    expect(res.status).toBe(200);
    const rolled = store.get(REPEAT_QUESTS_KEY) as {
      daily: {
        key: string;
        baseline: { fishCaught: number };
        claimed: string[];
      };
    };
    expect(rolled.daily).toMatchObject({
      key: kstDailyKey(new Date(now)),
      baseline: { fishCaught: 7 },
      claimed: [],
    });
    expect(store.get(FISHING_CODEX_KEY)).toMatchObject({
      fish: { carp: { totalCaught: 8 } },
    });
  });

  it("5연속 성공부터 코인 보너스와 연속 버프를 적용한다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(FISHING_STREAK_KEY, { current: 4, best: 4 });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      caught: boolean;
      coinsGained: number;
      streak: {
        current: number;
        best: number;
        buffTier: number;
        coinBonus: number;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.caught).toBe(true);
    expect(json.coinsGained).toBe(4); // 잉어(uncommon) 3 + 5연속 보너스 1
    expect(json.streak).toMatchObject({
      current: 5,
      best: 5,
      buffTier: 1,
      coinBonus: 1,
    });
    expect(store.get(FISHING_STREAK_KEY)).toEqual({ current: 5, best: 5 });
    expect(store.get(FISHING_WALLET_KEY)).toMatchObject({
      coins: 4,
      catchDay: { earned: 4 },
    });
  });

  it("낚시 레벨업 보상 코인은 챔질 일일 상한과 별도로 지급한다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: 34,
    });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      caught: boolean;
      coinsGained: number;
      levelRewardCoins: number;
      fishingLevel: number;
      fishingLevelUp: boolean;
    };

    expect(json.ok).toBe(true);
    expect(json.caught).toBe(true);
    expect(json.fishingLevel).toBe(2);
    expect(json.fishingLevelUp).toBe(true);
    expect(json.coinsGained).toBe(3);
    expect(json.levelRewardCoins).toBe(40);
    expect(store.get(FISHING_WALLET_KEY)).toMatchObject({
      coins: 43,
      catchDay: { earned: 3 },
    });
  });

  it("성공 판정 실패는 연속 기록을 끊는다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(FISHING_STREAK_KEY, { current: 7, best: 9 });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: -1 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      caught: boolean;
      reason: string;
    };
    expect(json).toEqual({
      ok: true,
      caught: false,
      reason: "too_early",
      nextActionAt: null,
    });
    expect(store.get(FISHING_STREAK_KEY)).toEqual({ current: 0, best: 9 });
  });

  it("입질보다 300ms 이상 빠른 입력은 최근 다섯 번째부터 강신호로 승격한다", async () => {
    const now = Date.now();
    seedFisherSession(now);

    for (let index = 1; index <= 5; index += 1) {
      store.set(FISHING_SESSION_KEY, {
        castId: `cast-${index}`,
        biteAt: now + 300,
        expiresAt: now + 10_000,
        fishId: "carp",
        size: 42,
      });
      await POST(reelReq({ castId: `cast-${index}`, reactionMs: 0 }));
      const risk = activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "fishing",
      ).riskScore;
      expect(risk).toBe(index < 5 ? 0 : 18);
    }

    expect(store.get(FISHING_ANTI_MACRO_KEY)).toMatchObject({
      recent: expect.arrayContaining([
        expect.objectContaining({ earlyByMs: 300 }),
      ]),
    });
  });

  it("일일 활동량만 많으면 어획 보상을 유지하고 대기를 추가하지 않는다", async () => {
    const now = Date.now();
    seedFisherSession(now);
    store.set(ACTIVITY_GUARD_KEY, {
      version: 3,
      activities: {},
      risk: {
        score: 0,
        updatedAt: now,
        dailyKey: kstDailyKey(new Date(now)),
        dailyCompleted: 1_499,
        dailyVolumeStage: 2,
      },
    });

    const res = await POST(reelReq({ castId: "cast-1", reactionMs: 200 }));
    const json = (await res.json()) as {
      caught: boolean;
      fishId: string;
      nextActionAt: number | null;
    };

    expect(json).toMatchObject({
      caught: true,
      fishId: "carp",
      nextActionAt: null,
    });
  });
});
