import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "user-1"),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_tx, _userId, _key, fallback) => fallback),
  lockSaveForUpdate: vi.fn(),
  upsertSave: vi.fn(),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  associationFacilityLevel: vi.fn(async () => 1),
  claimWeeklyFacilitySource: vi.fn(),
  readWeeklyFacilitySourceSelection: vi.fn(async () => ({
    weekKey: "2026-08-31",
    source: "guild" as const,
    guildId: 11,
  })),
}));

import { GET } from "@/app/api/v2/guild/alchemy-workshop/route";

describe("guild alchemy workshop weekly source", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("현재 주간 출처와 협회 공방이 충돌하면 GET에서 이용 불가를 알린다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:00+09:00"));

    const response = await GET(
      new Request(
        "http://test/api/v2/guild/alchemy-workshop?scope=association",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      weeklySourceEligible: false,
    });
  });
});
