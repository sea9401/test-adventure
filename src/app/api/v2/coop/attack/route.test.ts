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
import { initialInvincibleFortressState } from "@/adventure/v2/combat/invincibleFortressMechanic";
import { initialImmortalBerserkerState } from "@/adventure/v2/combat/immortalBerserkerMechanic";

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

  it("불괴의 성채 방벽 상태를 전투에 주입하고 MP와 함께 원자적으로 저장한다", async () => {
    const sharedMaxHp = 10_800_000;
    const initialFortress = initialInvincibleFortressState(sharedMaxHp);
    const completedFortress = {
      ...initialFortress,
      completedBarrierCount: 1 as const,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: 2 as const,
      barrierResults: [2 as const],
    };
    const session = personalSession({
      regionId: "invincible_fortress",
      hp: sharedMaxHp,
      maxHp: sharedMaxHp,
      mechanicState: { bossMp: 7, fortress: initialFortress },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 0 }]];
    mocks.updateRows = [[{ hp: sharedMaxHp }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 3,
      finalState: battleState({
        enemyHp: sharedMaxHp,
        enemyMp: 0,
        bossMechanic: completedFortress,
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
        bossMechanic: {
          kind: "invincible_fortress",
          sharedMaxHp,
          initialState: initialFortress,
        },
      }),
    );
    expect(mocks.updateValues[0]?.mechanicState).toMatchObject({
      bossMp: 0,
      fortress: completedFortress,
    });
    expect(body.result).toMatchObject({
      fortressEnrageTier: 2,
      fortressCompletedResults: [2],
    });
  });

  it("불괴의 성채 처치 시 종료 세션에서 방벽 상태를 제거한다", async () => {
    const sharedMaxHp = 10_800_000;
    const finishedFortress = {
      kind: "invincible_fortress" as const,
      completedBarrierCount: 4 as const,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: 1 as const,
      barrierResults: [2, 2, 1, 1] as const,
    };
    const session = personalSession({
      regionId: "invincible_fortress",
      hp: 1,
      maxHp: sharedMaxHp,
      mechanicState: { bossMp: 0, fortress: finishedFortress },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 1 }]];
    mocks.updateRows = [[{ hp: 0 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "win",
      turns: 1,
      finalState: battleState({
        enemyHp: 0,
        bossMechanic: finishedFortress,
      }),
    });

    const response = await attack();

    expect(response.status).toBe(200);
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty("fortress");
  });

  it("성채 시뮬레이션 중 다른 공격이 방벽을 갱신했으면 오래된 결과를 저장하지 않는다", async () => {
    const sharedMaxHp = 10_800_000;
    const initialFortress = initialInvincibleFortressState(sharedMaxHp);
    const peek = personalSession({
      regionId: "invincible_fortress",
      hp: sharedMaxHp,
      maxHp: sharedMaxHp,
      mechanicState: { fortress: initialFortress },
    });
    const locked = personalSession({
      ...peek,
      mechanicState: {
        fortress: { ...initialFortress, barrierDamage: 5_000 },
      },
    });
    mocks.selectRows = [[peek], [locked]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 1,
      finalState: battleState({
        enemyHp: sharedMaxHp,
        bossMechanic: { ...initialFortress, barrierDamage: 10_000 },
      }),
    });

    const response = await attack();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "boss_state_changed",
    });
    expect(mocks.updateValues).toHaveLength(0);
  });

  it("불멸 보스의 본체 피해와 회복을 합산한 순진행량만 HP와 기여도로 저장한다", async () => {
    const sharedMaxHp = 10_800_000;
    const initial = initialImmortalBerserkerState(sharedMaxHp);
    const final = { ...initial, regenActionCount: 1 };
    const session = personalSession({
      regionId: "immortal_berserker",
      hp: 8_000_000,
      maxHp: sharedMaxHp,
      mechanicState: { bossMp: 7, immortalBerserker: initial },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 100_000 }]];
    mocks.updateRows = [[{ hp: 7_900_000 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 3,
      finalState: battleState({
        enemyHp: 7_900_000,
        bossMechanic: {
          ...final,
          immortalBodyDamage: 200_000,
          immortalHealing: 100_000,
          immortalRevivalCount: 0,
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
        bossMechanic: {
          kind: "immortal_berserker",
          sharedMaxHp,
          initialState: initial,
        },
      }),
    );
    expect(mocks.updateValues[0]).toMatchObject({
      hp: 7_900_000,
      mechanicState: { immortalBerserker: final },
    });
    expect(body.result).toMatchObject({
      damageDealt: 100_000,
      immortalBodyDamage: 200_000,
      immortalHealing: 100_000,
      netProgress: 100_000,
      bossHp: 7_900_000,
    });
  });

  it("불멸 보스가 공격 중 더 많이 회복하면 HP 증가는 저장하되 기여도는 0이다", async () => {
    const sharedMaxHp = 10_800_000;
    const initial = initialImmortalBerserkerState(sharedMaxHp);
    const session = personalSession({
      regionId: "immortal_berserker",
      hp: 8_000_000,
      maxHp: sharedMaxHp,
      mechanicState: { immortalBerserker: initial },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 0 }]];
    mocks.updateRows = [[{ hp: 8_050_000 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 3,
      finalState: battleState({
        enemyHp: 8_050_000,
        bossMechanic: {
          ...initial,
          immortalBodyDamage: 50_000,
          immortalHealing: 100_000,
          immortalRevivalCount: 0,
        },
      }),
    });

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateValues[0]).toMatchObject({ hp: 8_050_000 });
    expect(body.result).toMatchObject({
      damageDealt: 0,
      immortalBodyDamage: 50_000,
      immortalHealing: 100_000,
      netProgress: 0,
      bossHp: 8_050_000,
    });
  });

  it("불멸 보스 시뮬레이션 중 HP나 생명 상태가 바뀌면 오래된 결과를 저장하지 않는다", async () => {
    const sharedMaxHp = 10_800_000;
    const initial = initialImmortalBerserkerState(sharedMaxHp);
    const peek = personalSession({
      regionId: "immortal_berserker",
      hp: 8_000_000,
      maxHp: sharedMaxHp,
      mechanicState: { immortalBerserker: initial },
    });
    const locked = personalSession({
      ...peek,
      hp: 7_900_000,
      mechanicState: {
        immortalBerserker: { ...initial, regenActionCount: 1 },
      },
    });
    mocks.selectRows = [[peek], [locked]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "lose",
      turns: 1,
      finalState: battleState({
        enemyHp: 7_800_000,
        bossMechanic: {
          ...initial,
          immortalBodyDamage: 200_000,
          immortalHealing: 0,
          immortalRevivalCount: 0,
        },
      }),
    });

    const response = await attack();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "boss_state_changed",
    });
    expect(mocks.updateValues).toHaveLength(0);
  });

  it("불멸 보스는 셋째 생명이 0이 된 경우에만 처치 상태로 끝난다", async () => {
    const sharedMaxHp = 10_800_000;
    const finalLife = {
      kind: "immortal_berserker" as const,
      lifeIndex: 2 as const,
      regenActionCount: 0,
      regenUsesRemaining: 0 as const,
      revivalsCompleted: 2 as const,
    };
    const session = personalSession({
      regionId: "immortal_berserker",
      hp: 100,
      maxHp: sharedMaxHp,
      mechanicState: { immortalBerserker: finalLife },
    });
    mocks.selectRows = [[session], [session], [], [{ damage: 100 }]];
    mocks.updateRows = [[{ hp: 0 }]];
    mocks.insertRows = [[{ id: "attack-1" }]];
    mocks.resolveBattle.mockReturnValue({
      outcome: "win",
      turns: 1,
      finalState: battleState({
        enemyHp: 0,
        bossMechanic: {
          ...finalLife,
          immortalBodyDamage: 100,
          immortalHealing: 0,
          immortalRevivalCount: 0,
        },
      }),
    });

    const response = await attack();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({ defeated: true, bossHp: 0 });
    expect(mocks.updateValues[0]?.mechanicState).not.toHaveProperty(
      "immortalBerserker",
    );
  });

  it("셋째 생명이 아닌 전투 결과가 HP 0을 보고하면 저장을 거부한다", async () => {
    const sharedMaxHp = 10_800_000;
    const initial = initialImmortalBerserkerState(sharedMaxHp);
    const session = personalSession({
      regionId: "immortal_berserker",
      hp: 8_000_000,
      maxHp: sharedMaxHp,
      mechanicState: { immortalBerserker: initial },
    });
    mocks.selectRows = [[session], [session], []];
    mocks.resolveBattle.mockReturnValue({
      outcome: "win",
      turns: 1,
      finalState: battleState({
        enemyHp: 0,
        bossMechanic: {
          ...initial,
          immortalBodyDamage: 8_000_000,
          immortalHealing: 0,
          immortalRevivalCount: 0,
        },
      }),
    });

    const response = await attack();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "boss_state_changed",
    });
    expect(mocks.updateValues).toHaveLength(0);
  });
});
