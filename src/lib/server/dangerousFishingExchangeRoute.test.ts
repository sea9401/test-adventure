import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, auth, rateLimit, grantTitle, persistence, lockOrder } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  auth: { userId: "u-exchange" as string | null },
  rateLimit: vi.fn(() => null as Response | null),
  persistence: { failOnKey: null as string | null },
  lockOrder: [] as string[],
  grantTitle: vi.fn(async (_tx: unknown, _userId: string, titleId: string, obtainedAt: number) => {
    const current = (store.get("adventure-log.v2") ?? {}) as {
      titles?: Record<string, { obtainedAt: number }>;
    };
    if (current.titles?.[titleId]) return false;
    store.set("adventure-log.v2", {
      ...current,
      titles: { ...current.titles, [titleId]: { obtainedAt } },
    });
    return true;
  }),
}));

let transactionTail = Promise.resolve();

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => auth.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: rateLimit,
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: grantTitle,
  ownedTitleIdsOf: (raw: unknown) => {
    const titles = (raw as { titles?: unknown } | undefined)?.titles;
    return titles && typeof titles === "object" ? Object.keys(titles) : [];
  },
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = transactionTail;
      let release = () => {};
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = structuredClone([...store.entries()]);
      try {
        const insertion = {
          values: () => ({ onConflictDoNothing: async () => undefined }),
        };
        const query: Record<string, unknown> = {};
        query.from = () => query;
        query.where = () => query;
        query.for = () => {
          lockOrder.push("user");
          return query;
        };
        query.limit = async () => [{ id: "u-exchange" }];
        return await callback({
          insert: () => insertion,
          select: () => query,
        });
      } catch (error) {
        store.clear();
        for (const [key, value] of snapshot) store.set(key, value);
        throw error;
      } finally {
        release();
      }
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) => {
    lockOrder.push(key);
    return store.has(key) ? store.get(key) : fallback;
  }),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    if (persistence.failOnKey === key) throw new Error("persistence failure");
    store.set(key, value);
  }),
}));

import {
  GET,
  POST,
} from "@/app/api/v2/dangerous-fishing/exchange/route";
import {
  DANGEROUS_FISH,
  dangerousBossMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  createDangerousRealtimeState,
  dangerousRealtimeMaxTicks,
  dangerousRealtimeTargetCalibration,
} from "@/adventure/v2/dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "@/adventure/v2/dangerousFishingRealtimeModifiers";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  emptyDangerousFishingState,
  parseDangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
} from "@/adventure/v2/fishingProgression";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import { parseDangerousFishingExchangeState } from "@/lib/server/dangerousFishingExchange";

const NOW = 1_800_100_000_000;

function exchangeRequest(body: Record<string, unknown>) {
  return new Request("http://test/api/v2/dangerous-fishing/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function requestBody(
  overrides: Partial<{
    action: string;
    operationId: string;
    entryId: string;
    batches: number;
    selectedMaterials: Record<string, number>;
    gearKind: string;
    gearId: string;
  }> = {},
) {
  return {
    operationId: "4fd3980e-0d2f-4f0d-8214-0b7e51bd52f4",
    entryId: "token_tidal_to_luminous_bait",
    batches: 1,
    ...overrides,
  };
}

function enhanceBody(
  overrides: Partial<{
    action: string;
    operationId: string;
    gearKind: string;
    gearId: string;
    expectedCurrentLevel: number;
    expectedNextLevel: number;
    selectedMaterials: Record<string, number>;
  }> = {},
) {
  return {
    action: "enhance",
    operationId: "0d466627-17c8-4556-8667-cd3c97e73c14",
    gearKind: "rod",
    gearId: "breaker_rod",
    expectedCurrentLevel: 0,
    expectedNextLevel: 1,
    ...overrides,
  };
}

function seedUnlocked(materials: Record<string, number> = {}) {
  store.clear();
  auth.userId = "u-exchange";
  store.set("character.v2", { materials, museunCosmetics: {} });
  store.set(FISHING_PROGRESS_KEY, {
    ...emptyFishingProgression(),
    xp: 14 ** 2 * 35,
  });
  store.set(FISHING_WALLET_KEY, { coins: 100_000 });
  store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
}

function savedCharacter() {
  return store.get("character.v2") as {
    materials: Record<string, number>;
    museunCosmetics?: { permanentOwned?: string[] };
  };
}

function savedDangerous() {
  return parseDangerousFishingState(store.get(DANGEROUS_FISHING_SAVE_KEY));
}

function savedWallet() {
  return store.get(FISHING_WALLET_KEY) as { coins: number };
}

function seedOwnedBreakerRod(
  materials: Record<string, number>,
  coins: number,
  level = 0,
) {
  seedUnlocked(materials);
  store.set(FISHING_WALLET_KEY, { coins });
  const state = emptyDangerousFishingState();
  store.set(DANGEROUS_FISHING_SAVE_KEY, {
    ...state,
    ownedGear: {
      ...state.ownedGear,
      rods: [...state.ownedGear.rods, "breaker_rod"],
    },
    gearEnhancements: {
      ...state.gearEnhancements,
      rods: level > 0 ? { breaker_rod: level } : {},
    },
  });
}

function activeRealtimeEncounter() {
  const modifierSource = {
    fishingLevel: 50,
    baitId: "basic_bait" as const,
    rodId: "breaker_rod" as const,
    reelId: "starter_reel" as const,
    lineId: "starter_line" as const,
    maxTensionBonus: -3,
    reelPowerBonus: 0,
    staminaDamageBonus: 4,
    tensionControlBonus: 0,
    slackTolerance: 0,
    telegraphSteps: 0,
    rodEnhancementLevel: 0,
    reelEnhancementLevel: 0,
    lineEnhancementLevel: 0,
    cargoProtectionPct: 0,
    targetStamina: DANGEROUS_FISH.ironjaw_tuna.stamina,
    targetDistance: DANGEROUS_FISH.ironjaw_tuna.distance,
    targetBaseTension: DANGEROUS_FISH.ironjaw_tuna.baseTension,
  };
  const calibration = dangerousRealtimeTargetCalibration(
    {
      stamina: modifierSource.targetStamina,
      distance: modifierSource.targetDistance,
      baseTension: modifierSource.targetBaseTension,
      maxTensionBonus: modifierSource.maxTensionBonus,
    },
    2,
  );
  const configBase = {
    seed: 91,
    risk: 3,
    targetKind: "fish" as const,
    rarity: "rare" as const,
    behaviorPattern: ["turn", "charge", "thrash", "turn"] as const,
    ...calibration,
    modifiers: dangerousRealtimeModifiers(modifierSource),
  };
  const config = {
    ...configBase,
    maxTicks: dangerousRealtimeMaxTicks(configBase),
  };
  return {
    simulationVersion: 2 as const,
    balanceRevision: 2 as const,
    id: "stored-before-enhancement",
    targetKind: "fish" as const,
    targetId: "ironjaw_tuna" as const,
    modifierSource,
    config,
    checkpoint: createDangerousRealtimeState(config, 2),
    approvedTick: 0,
    revision: 0,
    startedAt: NOW,
    expiresAt: NOW + config.maxTicks * 50,
  };
}

describe("위험 해역 교환 Route Handler", () => {
  beforeEach(() => {
    transactionTail = Promise.resolve();
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 30 });
    rateLimit.mockReset();
    rateLimit.mockReturnValue(null);
    grantTitle.mockClear();
    persistence.failOnKey = null;
    lockOrder.length = 0;
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => vi.restoreAllMocks());

  it("인증과 속도 제한을 적용한다", async () => {
    auth.userId = null;
    expect((await GET()).status).toBe(401);

    auth.userId = "u-exchange";
    const limited = Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
    rateLimit.mockReturnValueOnce(limited);
    expect((await POST(exchangeRequest(requestBody()))).status).toBe(429);
  });

  it("낚시 15레벨 미만과 잘못된 요청 형식을 거부한다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: 13 ** 2 * 35,
    });
    const locked = await POST(exchangeRequest(requestBody()));
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({ error: "fishing_level_locked" });

    seedUnlocked();
    for (const body of [
      requestBody({ operationId: "not-a-uuid" }),
      requestBody({ batches: 0 }),
      requestBody({ batches: 101 }),
      requestBody({ entryId: "token_tidal_title", batches: 2 }),
      requestBody({ entryId: "unknown" }),
      enhanceBody({ operationId: "not-a-uuid" }),
      enhanceBody({ gearKind: "unknown" }),
      enhanceBody({ gearId: "unknown" }),
      enhanceBody({ expectedCurrentLevel: -1 }),
      enhanceBody({ expectedNextLevel: 2 }),
    ]) {
      const response = await POST(exchangeRequest(body));
      expect(response.status).toBe(400);
    }
  });

  it("강화 action의 누락 필드, 알 수 없는 action, 깨진 JSON을 bad request로 처리한다", async () => {
    seedUnlocked();
    const malformed = new Request(
      "http://test/api/v2/dangerous-fishing/exchange",
      { method: "POST", body: "{" },
    );
    const malformedResponse = await POST(malformed);
    expect(malformedResponse.status).toBe(400);
    await expect(malformedResponse.json()).resolves.toMatchObject({
      error: "bad_request",
    });

    for (const [body, error] of [
      [{ action: "enhance", operationId: enhanceBody().operationId, gearId: "breaker_rod" }, "invalid_kind"],
      [{ action: "enhance", operationId: enhanceBody().operationId, gearKind: "rod" }, "invalid_item"],
      [{ ...enhanceBody(), action: "reset" }, "bad_request"],
    ] as const) {
      const response = await POST(exchangeRequest(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error });
    }
  });

  it("조회 응답은 강화 비용, 저장 단계, 보유 장비별 다음 단계 비용과 구매 가능 여부를 제공한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    }, 1_000, 2);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enhancementCosts: {
        1: { materials: { common: 6, rare: 4 }, fishingCoins: 1_000 },
        2: { materials: { rare: 8, epic: 5 }, fishingCoins: 3_000 },
        3: { materials: { epic: 8, legendary: 3 }, fishingCoins: 8_000 },
      },
      state: {
        gearEnhancements: { rods: { breaker_rod: 2 }, reels: {}, lines: {} },
      },
      enhancementItems: expect.arrayContaining([
        expect.objectContaining({
          gearKind: "rod",
          gearId: "breaker_rod",
          level: 2,
          nextEnhancement: {
            level: 3,
            cost: { materials: { epic: 8, legendary: 3 }, fishingCoins: 8_000 },
            affordable: false,
          },
        }),
      ]),
    });
  });

  it("+1, +2, +3을 각각 정확한 어획물과 코인으로 한 단계씩 영구 강화한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 4,
      danger_catch_storm_mackerel: 2,
      danger_catch_ironjaw_tuna: 5,
      danger_catch_thunder_ray: 7,
      danger_catch_tempest_swordfish: 8,
      danger_catch_voidfin_coelacanth: 5,
      danger_catch_abyssal_crownfish: 3,
      unrelated: 9,
    }, 12_000);

    const plusOne = await POST(exchangeRequest(enhanceBody({
      selectedMaterials: { unrelated: 999 },
    })));
    expect(plusOne.status).toBe(200);
    await expect(plusOne.json()).resolves.toMatchObject({
      ok: true,
      alreadyProcessed: false,
      nextLevel: 1,
      state: { gearEnhancements: { rods: { breaker_rod: 1 } } },
      enhancementItems: expect.arrayContaining([
        expect.objectContaining({
          gearKind: "rod",
          gearId: "breaker_rod",
          level: 1,
          nextEnhancement: expect.objectContaining({
            level: 2,
            affordable: true,
          }),
        }),
      ]),
    });
    expect(lockOrder).toEqual([
      "user",
      DANGEROUS_FISHING_SAVE_KEY,
      FISHING_PROGRESS_KEY,
      "character.v2",
      FISHING_WALLET_KEY,
      "dangerous-fishing-exchange.v1",
    ]);
    expect(store.get("dangerous-fishing-exchange.v1")).toMatchObject({
      operations: [
        {
          id: enhanceBody().operationId,
          action: "enhance",
          gearKind: "rod",
          gearId: "breaker_rod",
          currentLevel: 0,
          nextLevel: 1,
        },
      ],
    });
    expect(savedWallet().coins).toBe(11_000);
    expect(savedCharacter().materials).toMatchObject({
      danger_catch_ironjaw_tuna: 5,
      danger_catch_thunder_ray: 3,
      unrelated: 9,
    });

    const plusTwo = await POST(exchangeRequest(enhanceBody({
      operationId: "34f3e2ec-4379-4daa-a73f-b81a1de80dc1",
      expectedCurrentLevel: 1,
      expectedNextLevel: 2,
    })));
    expect(plusTwo.status).toBe(200);
    await expect(plusTwo.json()).resolves.toMatchObject({
      nextLevel: 2,
      state: { gearEnhancements: { rods: { breaker_rod: 2 } } },
    });
    expect(savedWallet().coins).toBe(8_000);
    expect(savedCharacter().materials).toMatchObject({
      danger_catch_tempest_swordfish: 3,
      danger_catch_voidfin_coelacanth: 5,
      danger_catch_abyssal_crownfish: 3,
      unrelated: 9,
    });

    const plusOneRetry = await POST(exchangeRequest(enhanceBody()));
    expect(plusOneRetry.status).toBe(200);
    await expect(plusOneRetry.json()).resolves.toMatchObject({
      alreadyProcessed: true,
      gearKind: "rod",
      gearId: "breaker_rod",
      nextLevel: 1,
      state: { gearEnhancements: { rods: { breaker_rod: 2 } } },
    });
    expect(savedWallet().coins).toBe(8_000);

    const changedLevelIntent = await POST(exchangeRequest(enhanceBody({
      expectedCurrentLevel: 1,
      expectedNextLevel: 2,
    })));
    expect(changedLevelIntent.status).toBe(409);
    await expect(changedLevelIntent.json()).resolves.toMatchObject({
      error: "operation_conflict",
    });
    expect(savedWallet().coins).toBe(8_000);

    const plusThree = await POST(exchangeRequest(enhanceBody({
      operationId: "52d62eb9-c992-4de1-84f1-c6fb7df8d20a",
      expectedCurrentLevel: 2,
      expectedNextLevel: 3,
    })));
    expect(plusThree.status).toBe(200);
    await expect(plusThree.json()).resolves.toMatchObject({
      nextLevel: 3,
      state: { gearEnhancements: { rods: { breaker_rod: 3 } } },
      enhancementItems: expect.arrayContaining([
        expect.objectContaining({
          gearKind: "rod",
          gearId: "breaker_rod",
          level: 3,
          nextEnhancement: null,
        }),
      ]),
    });
    expect(savedWallet().coins).toBe(0);
    expect(savedCharacter().materials).toEqual({ unrelated: 9 });
  });

  it.each([
    [0, 1_000, { danger_catch_razor_sardine: 5, danger_catch_ironjaw_tuna: 4 }],
    [0, 1_000, { danger_catch_razor_sardine: 6, danger_catch_ironjaw_tuna: 3 }],
    [1, 3_000, { danger_catch_ironjaw_tuna: 7, danger_catch_tempest_swordfish: 5 }],
    [1, 3_000, { danger_catch_ironjaw_tuna: 8, danger_catch_tempest_swordfish: 4 }],
    [2, 8_000, { danger_catch_tempest_swordfish: 7, danger_catch_abyssal_crownfish: 3 }],
    [2, 8_000, { danger_catch_tempest_swordfish: 8, danger_catch_abyssal_crownfish: 2 }],
  ] as const)("+%i에서 필요한 등급 중 하나라도 부족하면 원자적으로 거부한다", async (level, coins, materials) => {
    seedOwnedBreakerRod({ ...materials }, coins, level);
    const before = structuredClone([...store.entries()]);

    const response = await POST(exchangeRequest(enhanceBody({
      expectedCurrentLevel: level,
      expectedNextLevel: (level + 1) as 1 | 2 | 3,
    })));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: "insufficient_materials" });
    expect([...store.entries()]).toEqual(before);
  });

  it.each([
    [0, 999, { danger_catch_razor_sardine: 6, danger_catch_ironjaw_tuna: 4 }],
    [1, 2_999, { danger_catch_ironjaw_tuna: 8, danger_catch_tempest_swordfish: 5 }],
    [2, 7_999, { danger_catch_tempest_swordfish: 8, danger_catch_abyssal_crownfish: 3 }],
  ] as const)("+%i에서 코인이 부족하면 어획물과 단계를 보존한다", async (level, coins, materials) => {
    seedOwnedBreakerRod({ ...materials }, coins, level);
    const before = structuredClone([...store.entries()]);

    const response = await POST(exchangeRequest(enhanceBody({
      expectedCurrentLevel: level,
      expectedNextLevel: (level + 1) as 1 | 2 | 3,
    })));

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: "insufficient_coins" });
    expect([...store.entries()]).toEqual(before);
  });

  it("미보유 장비와 최대 강화 요청을 차감 없이 거부한다", async () => {
    seedUnlocked({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    });
    let response = await POST(exchangeRequest(enhanceBody()));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "not_owned" });

    seedOwnedBreakerRod({
      danger_catch_tempest_swordfish: 8,
      danger_catch_abyssal_crownfish: 3,
    }, 8_000, 3);
    const before = structuredClone([...store.entries()]);
    response = await POST(exchangeRequest(enhanceBody({
      expectedCurrentLevel: 3,
      expectedNextLevel: 3,
    })));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "max_level" });
    expect([...store.entries()]).toEqual(before);
  });

  it("같은 강화 operationId의 재전송과 동시 요청은 동일 단계에서 한 번만 차감한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 12,
      danger_catch_ironjaw_tuna: 8,
    }, 2_000);
    const body = enhanceBody();

    const [first, second] = await Promise.all([
      POST(exchangeRequest(body)),
      POST(exchangeRequest(body)),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    const payloads = await Promise.all([first.json(), second.json()]);
    expect(payloads.filter((payload) => payload.alreadyProcessed)).toHaveLength(1);
    for (const payload of payloads) {
      expect(payload).toMatchObject({
        gearKind: "rod",
        gearId: "breaker_rod",
        nextLevel: 1,
      });
    }
    expect(savedDangerous().gearEnhancements.rods.breaker_rod).toBe(1);
    expect(savedWallet().coins).toBe(1_000);
    expect(savedCharacter().materials).toMatchObject({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    });
  });

  it("두 클라이언트 중 먼저 +1이 완료되면 오래된 +0→+1 확인은 +2 비용을 쓰지 않고 권위 view로 거부한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 12,
      danger_catch_tempest_swordfish: 5,
    }, 4_000);
    const staleClientBody = enhanceBody({
      operationId: "c4268c52-a528-43e0-b4d6-26bd180b52e1",
    });

    const first = await POST(exchangeRequest(enhanceBody({
      operationId: "d66691dc-eef8-4c97-b460-ad318190a2b7",
    })));
    expect(first.status).toBe(200);
    expect(savedDangerous().gearEnhancements.rods.breaker_rod).toBe(1);
    expect(savedWallet().coins).toBe(3_000);

    const beforeStale = structuredClone([...store.entries()]);
    const stale = await POST(exchangeRequest(staleClientBody));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      ok: false,
      error: "stale_enhancement",
      fishingCoins: 3_000,
      state: { gearEnhancements: { rods: { breaker_rod: 1 } } },
      enhancementItems: expect.arrayContaining([
        expect.objectContaining({
          gearKind: "rod",
          gearId: "breaker_rod",
          level: 1,
          nextEnhancement: expect.objectContaining({ level: 2 }),
        }),
      ]),
    });
    expect([...store.entries()]).toEqual(beforeStale);
    expect(savedWallet().coins).toBe(3_000);
    expect(savedCharacter().materials).toMatchObject({
      danger_catch_ironjaw_tuna: 8,
      danger_catch_tempest_swordfish: 5,
    });
  });

  it("같은 operationId의 서로 다른 강화 대상은 하나만 승인하고 다른 요청은 충돌시킨다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 12,
      danger_catch_ironjaw_tuna: 8,
    }, 2_000);
    const state = savedDangerous();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      ownedGear: {
        ...state.ownedGear,
        reels: [...state.ownedGear.reels, "current_reel"],
      },
    });
    const operationId = enhanceBody().operationId;

    const [rod, reel] = await Promise.all([
      POST(exchangeRequest(enhanceBody({ operationId }))),
      POST(exchangeRequest(enhanceBody({
        operationId,
        gearKind: "reel",
        gearId: "current_reel",
      }))),
    ]);

    expect([rod.status, reel.status].sort()).toEqual([200, 409]);
    const outcomes = await Promise.all([
      rod.json().then((payload) => ({ status: rod.status, payload })),
      reel.json().then((payload) => ({ status: reel.status, payload })),
    ]);
    const accepted = outcomes.find((outcome) => outcome.status === 200);
    const conflicted = outcomes.find((outcome) => outcome.status === 409);
    expect(accepted?.payload).toMatchObject({ nextLevel: 1 });
    expect(conflicted?.payload).toMatchObject({ error: "operation_conflict" });
    if (accepted?.payload.gearKind === "rod") {
      expect(savedDangerous().gearEnhancements).toEqual({
        rods: { breaker_rod: 1 },
        reels: {},
        lines: {},
      });
    } else {
      expect(accepted?.payload).toMatchObject({
        gearKind: "reel",
        gearId: "current_reel",
      });
      expect(savedDangerous().gearEnhancements).toEqual({
        rods: {},
        reels: { current_reel: 1 },
        lines: {},
      });
    }
    expect(savedWallet().coins).toBe(1_000);
  });

  it("강화 operationId를 legacy 교환에 재사용하면 충돌시키고 원래 강화 결과만 보존한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
      [dangerousBossMaterialId("tidal_colossus")]: 1,
    }, 1_000);
    const operationId = enhanceBody().operationId;
    expect((await POST(exchangeRequest(enhanceBody({ operationId })))).status).toBe(200);

    const replay = await POST(exchangeRequest(requestBody({ operationId })));

    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ error: "operation_conflict" });
    expect(savedDangerous().baitCounts.luminous_bait ?? 0).toBe(0);
    expect(savedCharacter().materials[dangerousBossMaterialId("tidal_colossus")]).toBe(1);
  });

  it("legacy 교환 operationId를 강화에 재사용하면 충돌시키고 legacy intent를 결합한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
      [dangerousBossMaterialId("tidal_colossus")]: 3,
    }, 1_000);
    const operationId = enhanceBody().operationId;
    const legacyBody = requestBody({ operationId, batches: 1 });
    expect((await POST(exchangeRequest(legacyBody))).status).toBe(200);
    expect(store.get("dangerous-fishing-exchange.v1")).toMatchObject({
      operations: [
        {
          id: operationId,
          action: "exchange",
          entryId: "token_tidal_to_luminous_bait",
          batches: 1,
          selectedMaterials: null,
        },
      ],
    });

    const exactLegacyRetry = await POST(exchangeRequest(legacyBody));
    expect(exactLegacyRetry.status).toBe(200);
    await expect(exactLegacyRetry.json()).resolves.toMatchObject({
      alreadyProcessed: true,
      entryId: "token_tidal_to_luminous_bait",
      batches: 1,
    });

    const changedQuantity = await POST(exchangeRequest(requestBody({
      operationId,
      batches: 2,
    })));
    expect(changedQuantity.status).toBe(409);
    await expect(changedQuantity.json()).resolves.toMatchObject({
      error: "operation_conflict",
    });

    const enhancement = await POST(exchangeRequest(enhanceBody({ operationId })));
    expect(enhancement.status).toBe(409);
    await expect(enhancement.json()).resolves.toMatchObject({
      error: "operation_conflict",
    });
    expect(savedDangerous().gearEnhancements.rods.breaker_rod ?? 0).toBe(0);
    expect(savedDangerous().baitCounts.luminous_bait).toBe(5);
  });

  it("legacy 어획물 교환은 같은 item/quantity라도 선택 재료 intent가 다르면 충돌한다", async () => {
    seedUnlocked({
      danger_catch_ironjaw_tuna: 4,
      danger_catch_thunder_ray: 4,
    });
    const operationId = enhanceBody().operationId;
    const acceptedBody = requestBody({
      operationId,
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 2,
      },
    });
    expect((await POST(exchangeRequest(acceptedBody))).status).toBe(200);

    const reorderedExactRetry = await POST(exchangeRequest(requestBody({
      operationId,
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: {
        danger_catch_thunder_ray: 2,
        danger_catch_ironjaw_tuna: 2,
      },
    })));
    expect(reorderedExactRetry.status).toBe(200);
    await expect(reorderedExactRetry.json()).resolves.toMatchObject({
      alreadyProcessed: true,
      entryId: "catch_rare_to_blood_bait",
      batches: 1,
    });

    const differentSelection = await POST(exchangeRequest(requestBody({
      operationId,
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: { danger_catch_ironjaw_tuna: 4 },
    })));
    expect(differentSelection.status).toBe(409);
    await expect(differentSelection.json()).resolves.toMatchObject({
      error: "operation_conflict",
    });
    expect(savedDangerous().baitCounts.blood_bait).toBe(5);
  });

  it("처리된 operationId라도 잘못된 강화 body는 duplicate 성공 전에 거부한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    }, 1_000);
    const operationId = enhanceBody().operationId;
    expect((await POST(exchangeRequest(enhanceBody({ operationId })))).status).toBe(200);

    const missingKind = await POST(exchangeRequest({
      action: "enhance",
      operationId,
      gearId: "breaker_rod",
    }));
    expect(missingKind.status).toBe(400);
    await expect(missingKind.json()).resolves.toMatchObject({ error: "invalid_kind" });

    const invalidItem = await POST(exchangeRequest(enhanceBody({
      operationId,
      gearId: "unknown",
    })));
    expect(invalidItem.status).toBe(400);
    await expect(invalidItem.json()).resolves.toMatchObject({ error: "invalid_item" });
  });

  it("구형 ID-only operation은 legacy 재시도만 호환하고 강화 성공으로 오인하지 않는다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
      [dangerousBossMaterialId("tidal_colossus")]: 1,
    }, 1_000);
    const operationId = enhanceBody().operationId;
    store.set("dangerous-fishing-exchange.v1", {
      version: 1,
      operations: [{ id: operationId, completedAt: NOW - 1 }],
    });

    const legacy = await POST(exchangeRequest(requestBody({ operationId })));
    expect(legacy.status).toBe(200);
    await expect(legacy.json()).resolves.toMatchObject({
      alreadyProcessed: true,
      operationId,
    });

    const enhancement = await POST(exchangeRequest(enhanceBody({ operationId })));
    expect(enhancement.status).toBe(409);
    await expect(enhancement.json()).resolves.toMatchObject({
      error: "operation_conflict",
    });
    expect(savedDangerous().gearEnhancements.rods.breaker_rod ?? 0).toBe(0);
  });

  it("강화 저장 도중 실패하면 재료, 코인, 단계, operation 기록을 모두 롤백한다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    }, 1_000);
    const before = structuredClone([...store.entries()]);
    persistence.failOnKey = "dangerous-fishing-exchange.v1";

    await expect(POST(exchangeRequest(enhanceBody()))).rejects.toThrow("persistence failure");

    expect([...store.entries()]).toEqual(before);
  });

  it("강화는 이미 저장된 realtime 조우 보정을 바꾸지 않고 다음 조우용 단계만 높인다", async () => {
    seedOwnedBreakerRod({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    }, 1_000);
    const state = savedDangerous();
    const encounter = activeRealtimeEncounter();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        id: "voyage-with-encounter",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 3,
        startedAt: NOW,
        cargo: [],
        encounter,
      },
    });

    const response = await POST(exchangeRequest(enhanceBody()));

    expect(response.status).toBe(200);
    expect(savedDangerous().gearEnhancements.rods.breaker_rod).toBe(1);
    expect(savedDangerous().voyage?.encounter).toEqual(encounter);
  });

  it("24시간이 지난 요청을 제거하고 최근 요청 128개만 보존한다", () => {
    const operations = Array.from({ length: 130 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      completedAt: NOW - index,
    }));
    operations.push({
      id: "e923cd52-a912-4518-86ea-a80333733699",
      completedAt: NOW - 24 * 60 * 60 * 1_000,
    });
    const parsed = parseDangerousFishingExchangeState({ operations }, NOW);
    expect(parsed.operations).toHaveLength(128);
    expect(parsed.operations[0]?.completedAt).toBe(NOW);
    expect(parsed.operations).not.toContainEqual(
      expect.objectContaining({ id: "e923cd52-a912-4518-86ea-a80333733699" }),
    );
  });

  it("혼합 희귀 어획물 4개를 핏빛 미끼 5개로 원자 교환한다", async () => {
    seedUnlocked({
      danger_catch_ironjaw_tuna: 2,
      danger_catch_thunder_ray: 2,
    });
    const response = await POST(exchangeRequest(requestBody({
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 2,
      },
    })));
    expect(response.status).toBe(200);
    expect(savedCharacter().materials).toEqual({});
    expect(savedDangerous().baitCounts.blood_bait).toBe(5);
  });

  it("다른 등급 선택과 부족한 재료는 아무것도 차감하지 않는다", async () => {
    seedUnlocked({ danger_catch_razor_sardine: 4 });
    const before = structuredClone([...store.entries()]);
    const invalid = await POST(exchangeRequest(requestBody({
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: { danger_catch_razor_sardine: 4 },
    })));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: "invalid_material_selection",
    });
    expect([...store.entries()]).toEqual(before);

    const insufficient = await POST(exchangeRequest(requestBody({
      operationId: "c95b5d2d-33e1-4a65-881f-83e22776465d",
      entryId: "token_abyss_to_abyss_bait",
    })));
    expect(insufficient.status).toBe(402);
    await expect(insufficient.json()).resolves.toMatchObject({ error: "insufficient_materials" });
  });

  it("증표와 코인을 함께 차감해 최상급 장비를 지급한다", async () => {
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 16 });
    const response = await POST(exchangeRequest(requestBody({ entryId: "token_maelstrom_reel" })));
    expect(response.status).toBe(200);
    expect(savedCharacter().materials).toEqual({
      [dangerousBossMaterialId("tidal_colossus")]: 8,
    });
    expect(savedDangerous().ownedGear.reels).toContain("maelstrom_reel");
    expect(store.get(FISHING_WALLET_KEY)).toMatchObject({ coins: 80_000 });

    const duplicate = await POST(exchangeRequest(requestBody({
      operationId: "f4772354-4cda-4ba0-a1b2-e5404d51b85f",
      entryId: "token_maelstrom_reel",
    })));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: "already_owned" });
  });

  it("낚시 코인이 부족하면 증표와 장비 상태를 바꾸지 않는다", async () => {
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 8 });
    store.set(FISHING_WALLET_KEY, { coins: 19_999 });
    const response = await POST(exchangeRequest(requestBody({ entryId: "token_maelstrom_reel" })));
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: "insufficient_coins" });
    expect(savedCharacter().materials[dangerousBossMaterialId("tidal_colossus")]).toBe(8);
    expect(savedDangerous().ownedGear.reels).not.toContain("maelstrom_reel");
  });

  it("칭호와 프로필 테두리를 각각 한 번만 지급한다", async () => {
    seedUnlocked({
      [dangerousBossMaterialId("tidal_colossus")]: 25,
      [dangerousBossMaterialId("abyss_kraken")]: 15,
    });
    const title = await POST(exchangeRequest(requestBody({ entryId: "token_tidal_title" })));
    expect(title.status).toBe(200);
    expect(grantTitle).toHaveBeenCalledWith(expect.anything(), "u-exchange", "dangerous_tidal_conqueror", NOW);

    const cosmetic = await POST(exchangeRequest(requestBody({
      operationId: "3d0044ad-f655-43b0-ac21-231b7bcf66ad",
      entryId: "token_abyssal_border",
    })));
    expect(cosmetic.status).toBe(200);
    expect(savedCharacter().museunCosmetics?.permanentOwned).toContain(
      "dangerous_abyssal_profile_border",
    );
  });

  it("같은 operationId 재전송과 동시 요청은 한 번만 차감하고 지급한다", async () => {
    const body = requestBody();
    const [first, second] = await Promise.all([
      POST(exchangeRequest(body)),
      POST(exchangeRequest(body)),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const payloads = await Promise.all([first.json(), second.json()]);
    expect(payloads.filter((payload) => payload.alreadyProcessed)).toHaveLength(1);
    expect(savedDangerous().baitCounts.luminous_bait).toBe(5);
    expect(savedCharacter().materials[dangerousBossMaterialId("tidal_colossus")]).toBe(29);
  });

  it("조회 응답은 해금, 잔액, 보유 상태, 카탈로그를 함께 반환한다", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      unlocked: true,
      fishingLevel: 15,
      fishingCoins: 100_000,
      materials: { [dangerousBossMaterialId("tidal_colossus")]: 30 },
      entries: expect.arrayContaining([
        expect.objectContaining({ id: "token_tidal_to_luminous_bait", maxBatches: 30 }),
      ]),
    });
  });
});
