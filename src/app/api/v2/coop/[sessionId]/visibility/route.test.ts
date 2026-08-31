import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  broadcastCoopNotice,
  insertFeedEntry,
  getGuildId,
} = vi.hoisted(() => ({
  state: {
    session: {} as Record<string, unknown>,
    updated: null as Record<string, unknown> | null,
  },
  broadcastCoopNotice: vi.fn(async () => undefined),
  insertFeedEntry: vi.fn(async () => undefined),
  getGuildId: vi.fn(async () => 7),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "owner-1"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId }));
vi.mock("@/lib/server/v2Coop", () => ({ broadcastCoopNotice }));
vi.mock("@/lib/server/serverFeed", () => ({ insertFeedEntry }));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (run: (tx: unknown) => unknown) => {
      const selectQuery: Record<string, unknown> = {};
      selectQuery.from = vi.fn(() => selectQuery);
      selectQuery.where = vi.fn(() => selectQuery);
      selectQuery.for = vi.fn(async () => [state.session]);

      const updateQuery: Record<string, unknown> = {};
      updateQuery.set = vi.fn((value: Record<string, unknown>) => {
        state.updated = value;
        return { where: vi.fn(async () => undefined) };
      });

      return run({
        select: vi.fn(() => selectQuery),
        update: vi.fn(() => updateQuery),
      });
    }),
  },
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ sessionId: "boss-session" }) };

function request(visibility: string) {
  return new Request(
    "http://test/api/v2/coop/boss-session/visibility",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility }),
    },
  );
}

describe("POST /api/v2/coop/[sessionId]/visibility", () => {
  beforeEach(() => {
    state.session = {
      id: "boss-session",
      regionId: "mountain_chief",
      bossName: "산군",
      hp: 100,
      maxHp: 100,
      defeatedAt: null,
      expiresAt: new Date("2100-01-01T00:00:00.000Z"),
      summonedByName: "산길잡이",
      summonerId: "owner-1",
      summonerGuildId: null,
      visibility: "summoner_only",
    };
    state.updated = null;
    broadcastCoopNotice.mockClear();
    insertFeedEntry.mockClear();
    getGuildId.mockClear();
  });

  it("개인 보스를 전체 공개하면 상태를 바꾸고 전체 알림을 한 번 발송한다", async () => {
    const response = await POST(request("public"), ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      visibility: "public",
      changed: true,
    });
    expect(state.updated).toMatchObject({ visibility: "public" });
    expect(insertFeedEntry).toHaveBeenCalledTimes(1);
    expect(insertFeedEntry).toHaveBeenCalledWith("owner-1", "coop_summon", {
      kind: "mountain_chief",
      sessionId: "boss-session",
      expiresAt: new Date("2100-01-01T00:00:00.000Z").getTime(),
    });
    expect(broadcastCoopNotice).toHaveBeenCalledTimes(1);
    expect(broadcastCoopNotice).toHaveBeenCalledWith(
      "산길잡이 님이 「산군」 토벌을 전체 공개했다",
    );
  });

  it.each(["summoner_only", "guild_only"])(
    "전체 공개된 보스를 %s 범위로 줄이지 못한다",
    async (visibility) => {
      state.session.visibility = "public";
      const response = await POST(request(visibility), ctx);
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "visibility_locked",
      });
      expect(state.updated).toBeNull();
      expect(insertFeedEntry).not.toHaveBeenCalled();
      expect(broadcastCoopNotice).not.toHaveBeenCalled();
    },
  );

  it("이미 전체 공개된 보스의 공개 재요청은 무변경이며 알림을 반복하지 않는다", async () => {
    state.session.visibility = "public";
    const response = await POST(request("public"), ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      visibility: "public",
      changed: false,
    });
    expect(state.updated).toBeNull();
    expect(insertFeedEntry).not.toHaveBeenCalled();
    expect(broadcastCoopNotice).not.toHaveBeenCalled();
  });

  it("전체 공개 전에는 길드 범위로 바꿔도 전체 알림을 발송하지 않는다", async () => {
    const response = await POST(request("guild_only"), ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      visibility: "guild_only",
      changed: true,
    });
    expect(state.updated).toMatchObject({
      visibility: "guild_only",
      summonerGuildId: 7,
    });
    expect(insertFeedEntry).not.toHaveBeenCalled();
    expect(broadcastCoopNotice).not.toHaveBeenCalled();
  });

  it("개인 미개척지 보스는 소환자도 공개 범위를 바꿀 수 없다", async () => {
    state.session.regionId = "tracking_weapon";
    state.session.bossName = "추적 병기";
    const response = await POST(request("public"), ctx);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "visibility_locked",
    });
    expect(state.updated).toBeNull();
    expect(insertFeedEntry).not.toHaveBeenCalled();
    expect(broadcastCoopNotice).not.toHaveBeenCalled();
  });

  it("잘못된 공개 범위는 전체 공개로 해석하지 않고 거부한다", async () => {
    const response = await POST(request("unexpected"), ctx);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "bad_visibility",
    });
    expect(state.updated).toBeNull();
    expect(insertFeedEntry).not.toHaveBeenCalled();
    expect(broadcastCoopNotice).not.toHaveBeenCalled();
  });
});
