import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "user-1" as string | null),
  readFishingCoins: vi.fn(async () => 456),
  readFishingCatchCoinProgress: vi.fn(async () => ({ earned: 123, cap: 3_000 })),
  readActiveAutoGatheringActivity: vi.fn(async () => "woodcutting" as const),
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/fishing/coins", () => ({
  readFishingCoins: mocks.readFishingCoins,
  readFishingCatchCoinProgress: mocks.readFishingCatchCoinProgress,
}));
vi.mock("@/lib/server/lifeActivityLock", () => ({
  readActiveAutoGatheringActivity: mocks.readActiveAutoGatheringActivity,
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: unknown, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.has(key) ? mocks.saves.get(key) : fallback,
  ),
}));
vi.mock("@/adventure/data/v2/v2RepeatQuests", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/adventure/data/v2/v2RepeatQuests")
  >();
  return {
    ...actual,
    kstDailyKey: vi.fn(() => "2026-09-10"),
    nextDailyResetAt: vi.fn(() => 1_800_000_000_000),
  };
});

import { GET } from "./route";

describe("GET /api/v2/fishing/challenges", () => {
  beforeEach(() => {
    mocks.saves.clear();
    mocks.ensureUser.mockResolvedValue("user-1");
  });

  it("낚시 화면 overview에 progression과 표시용 status를 함께 반환한다", async () => {
    mocks.saves.set("fishing-stock.v1", {
      version: 1,
      items: {},
      daily: {
        date: "2026-09-10",
        awarded: { catch_common: 7 },
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      coins: 456,
      dailyCatchCoins: { earned: 123, cap: 3_000 },
      activeAutoActivity: "woodcutting",
      progression: expect.any(Object),
    });
    expect(body.dailyCatchItems).toHaveLength(5);
    expect(body.dailyCatchItems[0]).toMatchObject({
      itemId: "catch_common",
      awarded: 7,
    });
  });
});
