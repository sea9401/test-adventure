// 낚시 reel 라우트 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리하고 라우트 본문은 REAL 코드로 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, upsertFishingRecord } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertFishingRecord: vi.fn(async () => {}),
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
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/fishing/reel/route";
import { FISHING_SESSION_KEY } from "@/adventure/v2/fishingSession";
import { FISHING_CODEX_KEY } from "@/adventure/v2/fishingCodex";
import { FISHING_STREAK_KEY } from "@/adventure/v2/fishingStreak";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
} from "@/adventure/v2/fishingProgression";

function reelReq(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/fishing/reel", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seedFisherSession(now: number) {
  store.clear();
  upsertFishingRecord.mockClear();
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
}

describe("POST /api/v2/fishing/reel", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_014_400_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("낚시 계열 직업은 성공한 챔질로 직업 숙련도가 오른다", async () => {
    const now = Date.now();
    seedFisherSession(now);

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
    };
    expect(json.ok).toBe(true);
    expect(json.caught).toBe(true);
    expect(json.fishingXpGained).toBe(4);
    expect(json.fishingLevel).toBe(1);
    expect(json.fishingCatches).toBe(1);
    expect(json.masteryGained).toBe(1);
    expect(json.masteryAfter).toBe(6);

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
    expect(upsertFishingRecord).toHaveBeenCalledOnce();
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
        fragmentChanceBonusPct: number;
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
      fragmentChanceBonusPct: 2,
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
    expect(json).toEqual({ ok: true, caught: false, reason: "too_early" });
    expect(store.get(FISHING_STREAK_KEY)).toEqual({ current: 0, best: 9 });
  });
});
