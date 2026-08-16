import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertedSessions,
  broadcastCoopNotice,
  insertFeedEntry,
  upsertSave,
} = vi.hoisted(() => ({
  insertedSessions: [] as Record<string, unknown>[],
  broadcastCoopNotice: vi.fn(async () => undefined),
  insertFeedEntry: vi.fn(async () => undefined),
  upsertSave: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "summoner-1"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({
    materials: { v2_boss_summon_scroll: 99 },
  })),
  readSave: vi.fn(async () => ({ name: "산길잡이" })),
  upsertSave,
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/v2Coop", () => ({
  broadcastCoopNotice,
  expireStaleCoopSessions: vi.fn(async () => undefined),
  findActiveCoopSessions: vi.fn(async () => []),
}));
vi.mock("@/lib/server/serverFeed", () => ({ insertFeedEntry }));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: unknown) => unknown) =>
      run({
        insert: vi.fn(() => ({
          values: vi.fn(async (value: Record<string, unknown>) => {
            insertedSessions.push(value);
          }),
        })),
      }),
    ),
  },
}));

import { POST } from "./route";

describe("POST /api/v2/coop/summon", () => {
  beforeEach(() => {
    insertedSessions.length = 0;
    broadcastCoopNotice.mockClear();
    insertFeedEntry.mockClear();
    upsertSave.mockClear();
  });

  it("클라이언트 공개 설정과 무관하게 새 보스를 개인 상태로 소환하고 알리지 않는다", async () => {
    const response = await POST(
      new Request("http://test/api/v2/coop/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "mountain_chief", visibility: "public" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insertedSessions).toHaveLength(1);
    expect(insertedSessions[0]).toMatchObject({
      regionId: "mountain_chief",
      summonerId: "summoner-1",
      visibility: "summoner_only",
    });
    expect(upsertSave).toHaveBeenCalledTimes(1);
    expect(insertFeedEntry).not.toHaveBeenCalled();
    expect(broadcastCoopNotice).not.toHaveBeenCalled();
  });
});
