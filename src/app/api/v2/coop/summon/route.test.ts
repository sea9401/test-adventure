import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  insertedSessions,
  broadcastCoopNotice,
  createCoopBossSession,
  insertFeedEntry,
  upsertSave,
} = vi.hoisted(() => ({
  insertedSessions: [] as Record<string, unknown>[],
  broadcastCoopNotice: vi.fn(async () => undefined),
  createCoopBossSession: vi.fn(),
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
  createCoopBossSession,
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
    createCoopBossSession.mockReset();
    createCoopBossSession.mockImplementation(async (_tx, args) => {
      const hard = args.kindId === "canyon_predator_hard";
      const expiresAt = args.now.getTime() + (hard ? 24 : 3) * 60 * 60 * 1000;
      insertedSessions.push({
        regionId: args.kindId,
        bossName: hard ? "재앙의 스콜피온 킹" : "산군",
        hp: hard ? 8_400_000 : 30_000,
        maxHp: hard ? 8_400_000 : 30_000,
        spawnedAt: args.now,
        expiresAt: new Date(expiresAt),
        summonerId: args.userId,
        visibility: args.visibility,
      });
      return { ok: true, sessionId: "session-1", expiresAt };
    });
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

  it("신규 HARD 6T 보스는 소환서 30장과 24시간 세션을 사용한다", async () => {
    const response = await POST(
      new Request("http://test/api/v2/coop/summon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "canyon_predator_hard" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      kind: "canyon_predator_hard",
      scrollsLeft: 69,
    });
    expect(insertedSessions[0]).toMatchObject({
      regionId: "canyon_predator_hard",
      bossName: "재앙의 스콜피온 킹",
      hp: 8_400_000,
      maxHp: 8_400_000,
      visibility: "summoner_only",
    });
    const spawnedAt = insertedSessions[0]?.spawnedAt as Date;
    const expiresAt = insertedSessions[0]?.expiresAt as Date;
    expect(expiresAt.getTime() - spawnedAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
