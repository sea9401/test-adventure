import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  ensureUser: vi.fn(async () => "user-1" as string | null),
  readFishingCatchCoinProgress: vi.fn(async () => ({ earned: 123, cap: 3_000 })),
  readActiveAutoGatheringActivity: vi.fn(async () => null),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/fishing/coins", () => ({
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
vi.mock("@/adventure/data/v2/v2RepeatQuests", () => ({
  kstDailyKey: vi.fn(() => "2026-08-25"),
}));

import { GET } from "./route";

describe("GET /api/v2/fishing/status", () => {
  beforeEach(() => {
    mocks.saves.clear();
    mocks.ensureUser.mockResolvedValue("user-1");
  });

  it("오늘 어획물 5종의 일일 진행량을 반환한다", async () => {
    mocks.saves.set("fishing-stock.v1", {
      version: 1,
      items: { catch_common: 100 },
      daily: {
        date: "2026-08-25",
        awarded: { catch_common: 7 },
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dailyCatchItems).toHaveLength(5);
    expect(body.dailyCatchItems[0]).toEqual({
      itemId: "catch_common",
      name: "일반 어획물",
      awarded: 7,
      cap: 50,
    });
    expect(body.dailyCatchItems[4]).toEqual({
      itemId: "catch_legendary",
      name: "전설의 어획물",
      awarded: 0,
      cap: 3,
    });
  });
});
