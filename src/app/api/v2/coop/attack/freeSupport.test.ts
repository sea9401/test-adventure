import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import {
  coopBossAttackLog,
  coopBossContributors,
  coopBossSessions,
} from "@/db/schema";

const h = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  contributor: null as Record<string, unknown> | null,
  char: {} as Record<string, unknown>,
  logs: [] as Record<string, unknown>[],
  disableOnLock: false,
  enemyHp: 0,
  upsertSave: vi.fn(async () => undefined),
  growth: vi.fn(async () => undefined),
  notifications: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: async () => "helper",
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: () => null,
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: async () => null,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: async () => h.char,
  readSave: async () => ({ name: "지원자" }),
  upsertSave: h.upsertSave,
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: async () => ({
    player: { maxHp: 100, player: { maxMp: 100 } },
    skills: {},
  }),
}));
vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: () => ({
    turns: 1,
    finalState: {
      enemyHp: h.enemyHp,
      enemyMp: 0,
      playerHp: 100,
      enemyV2Dots: [],
      log: [],
    },
  }),
  appendLog: (log: unknown[], entry: unknown) => [...log, entry],
}));
vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toReplayPayload: (state: unknown) => state,
}));
vi.mock("@/lib/server/growthLeapProgress", () => ({
  recordGrowthLeapStaminaSpendInTx: h.growth,
}));
vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationMany: h.notifications,
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: async () => undefined,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: () => undefined,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: async (run: (tx: unknown) => unknown) => run(executor()),
    select: () => executor().select(),
  },
}));

// DB boundary double: execute the actual route's persisted increments, preserving existing reward fields.
function scalar(value: unknown): unknown {
  if (!(value instanceof SQL)) return value;
  const query = new PgDialect().sqlToQuery(value);
  if (query.params.length) return query.params[0];
  if (query.sql.endsWith(" + 1")) return 1;
  throw new Error(`Unsupported SQL in test double: ${query.sql}`);
}
function executor() {
  return {
    select: () => {
      let table: unknown;
      const rows = () =>
        table === coopBossSessions
          ? [{ ...h.session }]
          : h.contributor
            ? [{ ...h.contributor, userId: "helper" }]
            : [];
      const query = {
        from: (t: unknown) => {
          table = t;
          return query;
        },
        where: () => query,
        limit: async () => rows(),
        for: async () => {
          if (h.disableOnLock) h.session.allowFreeSupport = false;
          return rows();
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(rows()).then(resolve),
      };
      return query;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          for (const [key, value] of Object.entries(values)) {
            h.session[key] =
              key === "hp"
                ? Math.max(0, Number(h.session.hp) - Number(scalar(value)))
                : value;
          }
          return {
            returning: async () => [{ hp: h.session.hp }],
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({
          set,
        }: {
          set: Record<string, unknown>;
        }) => {
          if (table !== coopBossContributors)
            throw new Error("unexpected contributor table");
          if (!h.contributor) h.contributor = { ...values };
          else
            for (const [key, value] of Object.entries(set)) {
              h.contributor[key] =
                value instanceof SQL
                  ? Number(h.contributor[key]) + Number(scalar(value))
                  : value;
            }
        },
        returning: async () => {
          if (table !== coopBossAttackLog)
            throw new Error("unexpected log table");
          h.logs.push(values);
          return [{ id: 1 }];
        },
      }),
    }),
  };
}
import { POST } from "./route";
function request(support?: unknown) {
  return new Request("http://test/api/v2/coop/attack", {
    method: "POST",
    body: JSON.stringify({ sessionId: "boss", support }),
  });
}

describe("협동 무료 지원 공격", () => {
  beforeEach(() => {
    h.session = {
      id: "boss",
      regionId: "mountain_chief",
      hp: 100,
      maxHp: 1000,
      defeatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      visibility: "public",
      summonerId: "owner",
      summonerGuildId: null,
      allowFreeSupport: true,
      mechanicState: {},
      hardEnrageWeakened: false,
    };
    h.char = {
      stamina: { current: 0, lastUpdatedAt: Date.now() },
      materials: { existing: 2 },
    };
    h.contributor = {
      damage: 500,
      attackCount: 2,
      lastAttackAt: null,
      claimedAt: null,
      claimedRewardSnapshot: null,
    };
    h.logs = [];
    h.enemyHp = 0;
    h.disableOnLock = false;
    vi.clearAllMocks();
  });
  it("스태미나 0에서도 처치하고 기존 기여와 보상 자격을 보존한다", async () => {
    const res = await POST(request(true));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      result: { defeated: true, myDamage: 500, killingBlowReward: null },
    });
    expect(h.contributor).toMatchObject({
      damage: 500,
      attackCount: 2,
      claimedAt: null,
      claimedRewardSnapshot: null,
    });
    expect(h.contributor!.lastAttackAt).toBeInstanceOf(Date);
    expect(h.session.hp).toBe(0);
    expect(h.logs[0]).toMatchObject({ damageDealt: 100, isSupport: true });
    expect(h.upsertSave).not.toHaveBeenCalled();
    expect(h.growth).not.toHaveBeenCalled();
    expect(h.notifications).toHaveBeenCalledWith(
      ["helper"],
      "coop_defeated",
      expect.any(Object),
    );
  });
  it("지원만 한 유저는 피해 기여와 일반 공격 횟수가 0이다", async () => {
    h.contributor = null;
    expect((await POST(request(true))).status).toBe(200);
    expect(h.contributor).toMatchObject({ damage: 0, attackCount: 0 });
    expect(h.notifications).not.toHaveBeenCalled();
  });
  it("스태미나가 충분해도 지원에는 비용과 막타 보상을 지급하지 않는다", async () => {
    h.char.stamina = { current: 100, lastUpdatedAt: Date.now() };
    const response = await POST(request(true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { myDamage: 500, killingBlowReward: null },
    });
    expect(h.upsertSave).not.toHaveBeenCalled();
    expect(h.growth).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "지원 해제를 잠금 전후 모두 검사한다: lock=%s",
    async (lock) => {
      h.char.stamina = { current: 100, lastUpdatedAt: Date.now() };
      if (lock) h.disableOnLock = true;
      else h.session.allowFreeSupport = false;
      const response = await POST(request(true));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: "support_disabled",
      });
      expect(h.session.hp).toBe(100);
      expect(h.logs).toHaveLength(0);
      expect(h.upsertSave).not.toHaveBeenCalled();
    },
  );
  it("지원 허용은 비공개 보스 접근 권한을 우회하지 않는다", async () => {
    h.session.visibility = "summoner_only";
    expect((await POST(request(true))).status).toBe(403);
    expect(h.logs).toHaveLength(0);
  });
  it("무료 지원에도 기존 쿨다운을 적용한다", async () => {
    h.contributor!.lastAttackAt = new Date();
    expect((await POST(request(true))).status).toBe(429);
    expect(h.session.hp).toBe(100);
  });
  it("일반 공격은 스태미나를 소모하고 기여와 막타 보상을 지급한다", async () => {
    h.char.stamina = { current: 100, lastUpdatedAt: Date.now() };
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      result: { myDamage: 600, killingBlowReward: { coin: 5 } },
    });
    expect(h.contributor).toMatchObject({ damage: 600, attackCount: 3 });
    expect(h.upsertSave).toHaveBeenCalledWith(
      expect.anything(),
      "helper",
      "character.v2",
      expect.objectContaining({
        stamina: expect.objectContaining({ current: 80 }),
      }),
    );
    expect(h.growth).toHaveBeenCalledWith(
      expect.anything(),
      "helper",
      20,
      expect.any(Number),
    );
  });
  it("지원 뒤 일반 공격으로 바꿔도 쿨다운을 우회할 수 없다", async () => {
    h.enemyHp = 50;
    expect((await POST(request(true))).status).toBe(200);
    h.char.stamina = { current: 100, lastUpdatedAt: Date.now() };
    expect((await POST(request(false))).status).toBe(429);
    expect(h.session.hp).toBe(50);
    expect(h.contributor!.damage).toBe(500);
    expect(h.upsertSave).not.toHaveBeenCalled();
  });
  it.each([{ defeatedAt: new Date(), hp: 0 }, { expiresAt: new Date(0) }])(
    "종료된 보스에는 무료 지원을 적용하지 않는다",
    async (ended) => {
      Object.assign(h.session, ended);
      expect((await POST(request(true))).status).toBe(404);
      expect(h.logs).toHaveLength(0);
      expect(h.contributor!.damage).toBe(500);
    },
  );
  it("일반 공격은 지원 허용 여부와 무관하게 스태미나가 필요하다", async () => {
    const response = await POST(request(false));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "out_of_stamina" });
    expect(h.logs).toHaveLength(0);
  });
  it("지원 모드를 문자열로 보내면 거부한다", async () => {
    expect((await POST(request("true"))).status).toBe(400);
    expect(h.logs).toHaveLength(0);
  });
});
