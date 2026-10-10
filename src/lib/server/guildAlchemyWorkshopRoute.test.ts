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
}));

import { GET } from "@/app/api/v2/guild/alchemy-workshop/route";

describe("guild alchemy workshop after leaving a guild", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("같은 주에 길드 공방을 쓴 뒤에도 협회 공방 이용을 막지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T10:00:00+09:00"));

    const response = await GET(
      new Request(
        "http://test/api/v2/guild/alchemy-workshop?scope=association",
      ),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json).not.toHaveProperty("weeklySourceEligible");
  });
});
