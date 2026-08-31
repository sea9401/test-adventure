import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "outsider",
  selectRows: [] as unknown[][],
  updateRows: [] as unknown[][],
  insertRows: [] as unknown[][],
  updateValues: [] as Record<string, unknown>[],
  insertValues: [] as Record<string, unknown>[],
  resolveBattle: vi.fn(),
}));

const future = new Date(Date.now() + 60_000);

function personalSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "personal-1",
    regionId: "tracking_weapon",
    hp: 100,
    maxHp: 100,
    mechanicState: { trackingThreat: 37 },
    expiresAt: future,
    defeatedAt: null,
    summonerId: "outsider",
    summonerGuildId: null,
    visibility: "summoner_only",
    hardEnrageWeakened: false,
    ...overrides,
  };
}

function selectBuilder(rows: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    for: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return builder;
}

function makeTx() {
  return {
    select: vi.fn(() => selectBuilder(mocks.selectRows.shift() ?? [])),
    update: vi.fn(() => {
      const builder = {
        set: vi.fn((value: Record<string, unknown>) => {
          mocks.updateValues.push(value);
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn(async () => mocks.updateRows.shift() ?? []),
        then: (resolve: (value: undefined) => unknown) =>
          Promise.resolve(undefined).then(resolve),
      };
      return builder;
    }),
    insert: vi.fn(() => {
      const builder = {
        values: vi.fn((value: Record<string, unknown>) => {
          mocks.insertValues.push(value);
          return builder;
        }),
        onConflictDoUpdate: vi.fn(async () => undefined),
        returning: vi.fn(async () => mocks.insertRows.shift() ?? []),
      };
      return builder;
    }),
  };
}

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({ stamina: {}, materials: {} })),
  readSave: vi.fn(async () => ({ name: "추적자" })),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2BattlePrep", () => ({
  prepareV2BattleActor: vi.fn(async () => ({
    player: {
      maxHp: 100,
      player: { hp: 100, maxHp: 100, maxMp: 0, mp: 0 },
    },
    skills: [],
  })),
}));
vi.mock("@/adventure/v2/stamina", () => ({
  parseStaminaFromSave: vi.fn(() => ({ current: 100, updatedAt: 0 })),
  staminaConfigForCharacter: vi.fn(() => ({ max: 100, regenBonusPct: 0 })),
  tryConsume: vi.fn(() => ({ current: 80, updatedAt: 0 })),
  applyRegen: vi.fn((state) => state),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/adventure/v2/combat/engine", () => ({
  resolveBattle: mocks.resolveBattle,
  appendLog: vi.fn((log, entry) => [...log, entry]),
}));
vi.mock("@/adventure/data/v2/replayPayload", () => ({
  toReplayPayload: vi.fn(() => ({ version: 1, log: [] })),
}));
vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationMany: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(makeTx()),
    ),
    select: vi.fn(() => selectBuilder([])),
  },
}));

import { POST } from "./route";

function battleState(overrides: Record<string, unknown> = {}) {
  return {
    enemyHp: 80,
    playerHp: 50,
    enemyMp: 0,
    enemyV2Dots: [],
    log: [],
    bossMechanic: {
      kind: "tracking_weapon",
      trackingThreat: 64,
      trackingCounterCount: 1,
      trackingCounterDamage: 35,
    },
    ...overrides,
  };
}

async function attack() {
  return POST(
    new Request("http://localhost/api/v2/coop/attack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "personal-1" }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "outsider";
  mocks.selectRows = [];
  mocks.updateRows = [];
  mocks.insertRows = [];
  mocks.updateValues = [];
  mocks.insertValues = [];
  mocks.resolveBattle.mockReturnValue({
    outcome: "lose",
    turns: 3,
    finalState: battleState(),
  });
});

describe("POST /api/v2/coop/attack", () => {
  it("개인 보스가 public으로 손상돼도 소환자 외 공격을 거부한다", async () => {
    mocks.selectRows = [[personalSession({ summonerId: "owner", visibility: "public" })]];

    const response = await attack();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "no_permission",
    });
    expect(mocks.resolveBattle).not.toHaveBeenCalled();
    expect(mocks.updateValues).toHaveLength(0);
  });

  it("저장 게이지를 전투에 주입하고 사망 뒤 남은 게이지와 반격 지표를 저장한다", async () => {
    const session = personalSession();
    mocks.selectRows = [[session], [session], [], [{ damage: 20 }]];
    mocks.updateRows = [[{ hp: 80 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.resolveBattle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "추적자",
      expect.objectContaining({
        bossMechanic: { kind: "tracking_weapon", initialThreat: 37 },
      }),
    );
    expect(mocks.updateValues[0]?.mechanicState).toMatchObject({
      trackingThreat: 64,
    });
    expect(body.result).toMatchObject({
      trackingThreat: 64,
      trackingThreatMax: 100,
      trackingReady: false,
      trackingCounterCount: 1,
      trackingCounterDamage: 35,
    });
  });

  it("보스를 처치하면 엔진 잔여값과 관계없이 저장 게이지를 0으로 초기화한다", async () => {
    const session = personalSession({ hp: 20 });
    mocks.selectRows = [[session], [session], [], [{ damage: 20 }]];
    mocks.updateRows = [[{ hp: 0 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "win",
      turns: 1,
      finalState: battleState({
        enemyHp: 0,
        bossMechanic: {
          kind: "tracking_weapon",
          trackingThreat: 88,
          trackingCounterCount: 0,
          trackingCounterDamage: 0,
        },
      }),
    });

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateValues[0]?.mechanicState).toMatchObject({
      trackingThreat: 0,
    });
    expect(body.result).toMatchObject({
      defeated: true,
      trackingThreat: 0,
      trackingReady: false,
    });
  });

  it("독혈 군주 전투를 0중첩으로 시작하고 전투 요약만 응답한다", async () => {
    const session = personalSession({
      regionId: "toxic_blood_lord",
      mechanicState: { bossMp: 70 },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 20 }]];
    mocks.updateRows = [[{ hp: 80 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 3,
      finalState: battleState({
        bossMechanic: {
          kind: "toxic_blood_lord",
          toxicBloodStacks: 7,
          toxicRecoveryLockActions: 0,
          toxicExplosionCount: 2,
          toxicDamageTaken: 24_000,
        },
      }),
    });

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.resolveBattle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "추적자",
      expect.objectContaining({
        bossMechanic: { kind: "toxic_blood_lord" },
      }),
    );
    expect(mocks.updateValues[0]?.mechanicState).toMatchObject({ bossMp: 0 });
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "toxicBloodStacks",
    );
    expect(body.result).toMatchObject({
      toxicBloodStacks: 7,
      toxicRecoveryLockActions: 0,
      toxicExplosionCount: 2,
      toxicDamageTaken: 24_000,
      glacialChillStacks: 0,
      glacialFreezePending: 0,
      glacialFreezeCount: 0,
      glacialSkippedActionCount: 0,
    });
  });

  it("빙하 거수는 매 공격을 0중첩으로 시작하고 전투 요약만 응답한다", async () => {
    const session = personalSession({
      regionId: "glacial_colossus",
      mechanicState: {
        bossMp: 70,
        glacialChillStacks: 9,
        glacialFreezePending: 1,
        glacialFreezeCount: 99,
        glacialSkippedActionCount: 88,
      },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 20 }]];
    mocks.updateRows = [[{ hp: 80 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 3,
      finalState: battleState({
        bossMechanic: {
          kind: "glacial_colossus",
          glacialChillStacks: 7,
          glacialFreezePending: 1,
          glacialFreezeCount: 2,
          glacialSkippedActionCount: 1,
        },
      }),
    });

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.resolveBattle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "추적자",
      expect.objectContaining({
        bossMechanic: { kind: "glacial_colossus" },
      }),
    );
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "glacialChillStacks",
    );
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "glacialFreezePending",
    );
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "glacialFreezeCount",
    );
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "glacialSkippedActionCount",
    );
    expect(body.result).toMatchObject({
      glacialChillStacks: 7,
      glacialFreezePending: 1,
      glacialFreezeCount: 2,
      glacialSkippedActionCount: 1,
    });
  });
});
