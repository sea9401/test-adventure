import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  store,
  auth,
  bossSpawn,
  recordCodexMasteryGameplayBatch,
  transactionQueue,
  lockOrder,
  upsertKeys,
  failUpsertKey,
} = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  auth: { userId: "u-danger" as string | null },
  bossSpawn: vi.fn(async () => null),
  recordCodexMasteryGameplayBatch: vi.fn(async () => []),
  transactionQueue: { tail: Promise.resolve() as Promise<unknown> },
  lockOrder: [] as string[],
  upsertKeys: [] as string[],
  failUpsertKey: { current: null as string | null },
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => auth.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/lib/server/dangerousFishingBoss", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/dangerousFishingBoss")>();
  return {
    ...original,
    drizzleDangerousFishingBossStore: vi.fn(() => ({})),
    maybeSpawnDangerousFishingBoss: bossSpawn,
  };
});
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn((callback: (tx: unknown) => unknown) => {
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.for = () => {
        lockOrder.push("user");
        return query;
      };
      query.limit = async () => [];
      query.then = (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve);
      const run = transactionQueue.tail.then(async () => {
        const localStore = new Map(store);
        const result = await callback({
          select: vi.fn(() => query),
          __saves: localStore,
        });
        store.clear();
        for (const [key, value] of localStore) store.set(key, value);
        return result;
      });
      transactionQueue.tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSavesForUpdate: vi.fn(
    async (tx, _uid, fallbacks: Record<string, unknown>) => {
      const saves = tx?.__saves instanceof Map ? tx.__saves : store;
      lockOrder.push(`saves:${Object.keys(fallbacks).sort().join(",")}`);
      return Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          saves.has(key) ? saves.get(key) : fallback,
        ]),
      );
    },
  ),
  readSaves: vi.fn(
    async (tx, _uid, fallbacks: Record<string, unknown>) => {
      const saves = tx?.__saves instanceof Map ? tx.__saves : store;
      return Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          saves.has(key) ? saves.get(key) : fallback,
        ]),
      );
    },
  ),
  lockSaveForUpdate: vi.fn(async (tx, _uid, key: string, fallback: unknown) => {
    const saves = tx?.__saves instanceof Map ? tx.__saves : store;
    lockOrder.push(`save:${key}`);
    return saves.has(key) ? saves.get(key) : fallback;
  }),
  readSave: vi.fn(async (tx, _uid, key: string, fallback: unknown) => {
    const saves = tx?.__saves instanceof Map ? tx.__saves : store;
    return saves.has(key) ? saves.get(key) : fallback;
  }),
  upsertSave: vi.fn(async (tx, _uid, key: string, value: unknown) => {
    upsertKeys.push(key);
    if (failUpsertKey.current === key) throw new Error("forced save failure");
    const saves = tx?.__saves instanceof Map ? tx.__saves : store;
    saves.set(key, value);
  }),
}));

import { GET as STATUS } from "@/app/api/v2/dangerous-fishing/status/route";
import { POST as VOYAGE } from "@/app/api/v2/dangerous-fishing/voyage/route";
import { POST as ENCOUNTER } from "@/app/api/v2/dangerous-fishing/encounter/route";
import { POST as SHOP } from "@/app/api/v2/dangerous-fishing/shop/route";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  emptyDangerousFishingState,
  parseDangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  advanceDangerousRealtimeTick,
  createDangerousRealtimeState,
  dangerousRealtimeView,
  dangerousRealtimeMaxTicks,
  dangerousRealtimeTargetCalibration,
  type DangerousRealtimeBalanceRevision,
  type DangerousRealtimeConfig,
  type DangerousRealtimeInput,
  type DangerousRealtimeState,
} from "@/adventure/v2/dangerousFishingRealtime";
import { dangerousRealtimeModifiers } from "@/adventure/v2/dangerousFishingRealtimeModifiers";
import { isDangerousRealtimeEncounter } from "@/adventure/v2/dangerousFishingEncounter";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
  fishingLevelXpThreshold,
} from "@/adventure/v2/fishingProgression";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import { ACTIVITY_GUARD_KEY } from "@/lib/server/activityGuard";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import {
  DANGEROUS_BOSSES,
  DANGEROUS_FISH,
  isDangerousFishId,
} from "@/adventure/data/v2/dangerousFishing";
import { pickFish } from "@/lib/server/dangerousFishingService";

const NOW = 1_800_100_000_000;

function request(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://test/api/v2/dangerous-fishing/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedUnlocked() {
  store.clear();
  auth.userId = "u-danger";
  store.set("character.v2", {
    class: "survivor",
    specChoice: "fisher",
    materials: { v2_iron_ore: 3 },
  });
  store.set("proficiency.v2", {
    points: 20,
    groups: { survivor: { cultivations: 0, tier: 1, cumLevel: 10 } },
    caps: {},
    grown: {},
    jobCumLevel: { fisher: 5 },
    jobHistory: ["fisher"],
  });
  store.set("skills.v2", {
    learned: ["v2c_camper_tidereading"],
    equipped: ["v2c_camper_tidereading"],
  });
  store.set(FISHING_PROGRESS_KEY, {
    ...emptyFishingProgression(),
    xp: 14 ** 2 * 35,
  });
  store.set(FISHING_WALLET_KEY, { coins: 150_000 });
}

async function startVoyage(
  zoneId = "shattered_reef",
  depthId = "surface",
) {
  return VOYAGE(request("voyage", { action: "start", zoneId, depthId }));
}

function savedDangerousState() {
  return parseDangerousFishingState(store.get(DANGEROUS_FISHING_SAVE_KEY));
}

function activeBossAttempt(expiresAt = NOW + 180_000) {
  const boss = DANGEROUS_BOSSES.tidal_colossus;
  return {
    eventId: "active-boss-event",
    encounter: {
      simulationVersion: 1 as const,
      id: "active-boss-attempt",
      targetKind: "boss" as const,
      targetId: boss.id,
      status: "active" as const,
      tension: boss.baseTension,
      maxTension: 100,
      stamina: boss.attemptStamina,
      maxStamina: boss.attemptStamina,
      distance: boss.attemptDistance,
      startDistance: boss.attemptDistance,
      slackTurns: 0,
      slackTolerance: 0,
      step: 0,
      revision: 0,
      nextActionAt: NOW,
      expiresAt,
      patternSeed: 7,
      behaviorPattern: boss.behaviorPattern,
      reelPowerBonus: 0,
      staminaDamageBonus: 0,
      tensionControlBonus: 0,
      telegraphSteps: 0,
    },
  };
}

function realtimeEncounterFixture() {
  const modifierSource = {
    fishingLevel: 50,
    baitId: "basic_bait" as const,
    rodId: "starter_rod" as const,
    reelId: "starter_reel" as const,
    lineId: "starter_line" as const,
    maxTensionBonus: 5,
    reelPowerBonus: 2,
    staminaDamageBonus: 2,
    tensionControlBonus: 3,
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
  const targetCalibration = dangerousRealtimeTargetCalibration(
    {
      stamina: modifierSource.targetStamina,
      distance: modifierSource.targetDistance,
      baseTension: modifierSource.targetBaseTension,
      maxTensionBonus: modifierSource.maxTensionBonus,
    },
    2,
  );
  const configBase = {
    seed: 71,
    risk: 0,
    targetKind: "fish" as const,
    rarity: "rare" as const,
    behaviorPattern: ["turn", "charge", "thrash", "turn"] as const,
    ...targetCalibration,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: modifierSource.fishingLevel,
      baitId: modifierSource.baitId,
      reelPowerBonus: modifierSource.reelPowerBonus,
      staminaDamageBonus: modifierSource.staminaDamageBonus,
      tensionControlBonus: modifierSource.tensionControlBonus,
      slackTolerance: modifierSource.slackTolerance,
      telegraphSteps: modifierSource.telegraphSteps,
    }),
  };
  const config = {
    ...configBase,
    maxTicks: dangerousRealtimeMaxTicks(configBase),
  };
  return {
    simulationVersion: 2 as const,
    balanceRevision: 2 as const,
    id: "realtime-status",
    targetKind: "fish" as const,
    targetId: "ironjaw_tuna",
    modifierSource,
    config,
    checkpoint: createDangerousRealtimeState(config, 2),
    approvedTick: 0,
    revision: 0,
    startedAt: NOW,
    expiresAt: NOW + config.maxTicks * 50,
  };
}

function legacyRealtimeEncounterFixture() {
  const current = realtimeEncounterFixture();
  const { balanceRevision: _balanceRevision, ...unversioned } = current;
  const modifierSource = {
    ...unversioned.modifierSource,
    baitId: "luminous_bait" as const,
  };
  const targetCalibration = dangerousRealtimeTargetCalibration(
    {
      stamina: modifierSource.targetStamina,
      distance: modifierSource.targetDistance,
      baseTension: modifierSource.targetBaseTension,
      maxTensionBonus: modifierSource.maxTensionBonus,
    },
    1,
  );
  const configBase = {
    ...unversioned.config,
    ...targetCalibration,
    modifiers: dangerousRealtimeModifiers({
      fishingLevel: modifierSource.fishingLevel,
      baitId: modifierSource.baitId,
      reelPowerBonus: modifierSource.reelPowerBonus,
      staminaDamageBonus: modifierSource.staminaDamageBonus,
      tensionControlBonus: modifierSource.tensionControlBonus,
      slackTolerance: modifierSource.slackTolerance,
      telegraphSteps: modifierSource.telegraphSteps,
    }),
  };
  const config = {
    ...configBase,
    maxTicks: dangerousRealtimeMaxTicks(configBase),
  };
  return {
    ...unversioned,
    modifierSource,
    config,
    checkpoint: createDangerousRealtimeState(config, 1),
    expiresAt: NOW + config.maxTicks * 50,
  };
}

type RealtimeRouteEncounter = {
  simulationVersion: 2;
  balanceRevision: DangerousRealtimeBalanceRevision;
  id: string;
  targetKind: "fish" | "boss";
  targetId: string;
  config: DangerousRealtimeConfig;
  checkpoint: DangerousRealtimeState;
  approvedTick: number;
  revision: number;
  startedAt: number;
  expiresAt: number;
};

async function startRealtime(
  body: Record<string, unknown> = {},
): Promise<RealtimeRouteEncounter> {
  const response = await ENCOUNTER(
    request("encounter", {
      action: "start_realtime",
      baitId: "basic_bait",
      ...body,
    }),
  );
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json).toMatchObject({
    ok: true,
    encounter: { simulationVersion: 2, approvedTick: 0, revision: 0 },
  });
  return json.encounter as RealtimeRouteEncounter;
}

function responsiveTranscript(
  encounter: RealtimeRouteEncounter,
  stopTick = encounter.config.maxTicks,
) {
  let state = encounter.checkpoint;
  let mode = state.mode;
  const inputs: DangerousRealtimeInput[] = [];
  while (state.status === "active" && state.tick < stopTick) {
    const view = dangerousRealtimeView(state, encounter.config);
    const dangerousBehavior =
      (view.phase === "telegraph" || view.phase === "active") &&
      (view.behavior === "charge" || view.behavior === "dive");
    const nextMode =
      state.tension <= view.safeTensionMin + 80
        ? "reel"
        : state.tension >= view.safeTensionMax - 80 || dangerousBehavior
          ? "release"
          : "reel";
    if (nextMode !== mode) {
      inputs.push({ tick: state.tick, mode: nextMode });
      mode = nextMode;
    }
    state = advanceDangerousRealtimeTick(
      state,
      encounter.config,
      mode,
      encounter.balanceRevision,
    );
  }
  return { inputs, clientTick: state.tick, state };
}

function failureTranscript(encounter: RealtimeRouteEncounter) {
  let state = encounter.checkpoint;
  while (state.status === "active") {
    state = advanceDangerousRealtimeTick(state, encounter.config, "release");
  }
  return { inputs: [] as DangerousRealtimeInput[], clientTick: state.tick, state };
}

async function finishRealtime(
  encounter: RealtimeRouteEncounter,
  transcript: { inputs: DangerousRealtimeInput[]; clientTick: number },
  requestId: string,
) {
  return ENCOUNTER(
    request("encounter", {
      action: "finish",
      encounterId: encounter.id,
      revision: encounter.revision,
      inputs: transcript.inputs,
      clientTick: transcript.clientTick,
      requestId,
    }),
  );
}

describe("위험 해역 개인 Route Handler", () => {
  beforeEach(() => {
    seedUnlocked();
    transactionQueue.tail = Promise.resolve();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    bossSpawn.mockClear();
    bossSpawn.mockResolvedValue(null);
    recordCodexMasteryGameplayBatch.mockClear();
    lockOrder.length = 0;
    upsertKeys.length = 0;
    failUpsertKey.current = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("인증되지 않은 상태 조회를 401로 거부한다", async () => {
    auth.userId = null;
    const response = await STATUS();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
  });

  it("v2 조우 상태 조회는 서버 전용 보정 원본 없이 복구 가능한 tagged view를 반환한다", async () => {
    const state = emptyDangerousFishingState();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        id: "voyage-realtime",
        zoneId: "shattered_reef",
        depthId: "surface",
        risk: 0,
        startedAt: NOW,
        cargo: [],
        encounter: realtimeEncounterFixture(),
      },
    });

    const response = await STATUS();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      state: {
        voyage: {
          encounter: {
            simulationVersion: 2,
            id: "realtime-status",
            approvedTick: 0,
            revision: 0,
            checkpoint: { tick: 0, status: "active" },
          },
        },
      },
    });
    expect(json.state.voyage.encounter).not.toHaveProperty("modifierSource");
    expect(json.state).not.toHaveProperty("realtimeCompletions");
    expect(savedDangerousState().voyage?.encounter).toMatchObject({
      simulationVersion: 2,
      id: "realtime-status",
    });
  });

  it("revision 없는 기존 v2 조우는 legacy checkpoint와 미끼 스냅샷을 보존한다", async () => {
    const state = emptyDangerousFishingState();
    const legacy = legacyRealtimeEncounterFixture();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        id: "legacy-realtime-voyage",
        zoneId: "storm_trench",
        depthId: "midwater",
        risk: 0,
        startedAt: NOW,
        cargo: [],
        encounter: legacy,
      },
    });
    vi.mocked(Date.now).mockReturnValue(NOW + 50);

    const response = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: legacy.id,
        revision: 0,
        inputs: [],
        clientTick: 1,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.encounter).toMatchObject({
      approvedTick: 1,
      revision: 1,
      checkpoint: { tick: 1, maxTension: 1_050, performanceScalePermille: 1_000 },
    });
    expect(json.encounter).toHaveProperty("balanceRevision", 1);
    expect(json.encounter).not.toHaveProperty("modifierSource");
    expect(savedDangerousState()).toMatchObject({
      loadout: { baitId: "basic_bait" },
      voyage: {
        encounter: {
          balanceRevision: 1,
          modifierSource: { baitId: "luminous_bait" },
          approvedTick: 1,
          checkpoint: { tick: 1, maxTension: 1_050, performanceScalePermille: 1_000 },
        },
      },
    });

    const transcript = responsiveTranscript(json.encounter);
    expect(transcript.state.status).toBe("caught");
    vi.mocked(Date.now).mockReturnValue(NOW + transcript.clientTick * 50);
    const finished = await finishRealtime(
      json.encounter,
      transcript,
      "finish-legacy-revision-1",
    );
    expect(finished.status).toBe(200);
    await expect(finished.json()).resolves.toMatchObject({
      ok: true,
      event: "caught",
    });
  });

  it("저장된 revision 2 조우는 461 checkpoint와 finish replay 의미를 보존한다", async () => {
    const state = emptyDangerousFishingState();
    const revision2 = realtimeEncounterFixture();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        id: "revision-2-replay-voyage",
        zoneId: "shattered_reef",
        depthId: "surface",
        risk: 0,
        startedAt: NOW,
        cargo: [],
        encounter: revision2,
      },
    });
    vi.mocked(Date.now).mockReturnValue(NOW + 50);

    const checkpointResponse = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: revision2.id,
        revision: 0,
        inputs: [],
        clientTick: 1,
      }),
    );
    expect(checkpointResponse.status).toBe(200);
    const checkpointJson = await checkpointResponse.json();
    expect(checkpointJson.encounter).toMatchObject({
      balanceRevision: 2,
      revision: 1,
      approvedTick: 1,
      checkpoint: { tick: 1, performanceScalePermille: 461 },
    });

    const transcript = responsiveTranscript(checkpointJson.encounter);
    expect(transcript.state.status).toBe("caught");
    vi.mocked(Date.now).mockReturnValue(NOW + transcript.clientTick * 50);
    const finished = await finishRealtime(
      checkpointJson.encounter,
      transcript,
      "finish-calibrated-revision-2",
    );
    expect(finished.status).toBe(200);
    await expect(finished.json()).resolves.toMatchObject({
      ok: true,
      event: "caught",
    });
  });

  it("낚시 레벨 14는 잠금 안내를 보여주고 출항은 403으로 거부한다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: 13 ** 2 * 35,
    });
    const status = await STATUS();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      ok: true,
      heritage: { unlocked: false, fishingLevel: 14 },
    });

    const response = await startVoyage();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "fishing_level_locked",
      requiredLevel: 15,
    });
  });

  it("존재하지 않는 해역과 아직 해금하지 않은 해역을 거부한다", async () => {
    const invalid = await startVoyage("unknown");
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "invalid_zone" });

    const locked = await startVoyage("abyssal_rift", "deep");
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({
      error: "zone_level_locked",
      requiredLevel: 35,
    });
  });

  it("자동 채집 중에는 위험 해역 출항을 409로 거부한다", async () => {
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: "v2_iron_ore",
        startedAt: NOW,
        readyAt: NOW + 100_000,
        cycleDurationMs: 7_000,
        attempts: 20,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    const response = await startVoyage();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });
  });

  it("활성 거대어 시도가 있으면 새 항해를 기존 조우 충돌 형식으로 거부한다", async () => {
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...emptyDangerousFishingState(),
      bossAttempt: activeBossAttempt(),
    });

    const response = await startVoyage();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "encounter_active",
      eventId: "active-boss-event",
    });
  });

  it("만료 경계에 도달한 v1 거대어 시도를 해소한 뒤 출항하고 기존 상태를 보존한다", async () => {
    const expiresAt = NOW + 180_000;
    const before = {
      ...emptyDangerousFishingState(),
      baitCounts: { reef_bait: 3 },
      bossTraces: { tidal_colossus: 7 },
      bossAttempt: activeBossAttempt(expiresAt),
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, before);
    vi.mocked(Date.now).mockReturnValue(expiresAt);

    const response = await startVoyage();

    expect(response.status).toBe(200);
    const after = savedDangerousState();
    expect(after.bossAttempt).toBeNull();
    expect(after.baitCounts).toEqual(before.baitCounts);
    expect(after.bossTraces).toEqual(before.bossTraces);
    expect(after.codex).toEqual(before.codex);
    expect(after.realtimeCompletions).toEqual(before.realtimeCompletions);
    expect(after.resolvedEncounterIds).toEqual(before.resolvedEncounterIds);
  });

  it.each(["start", "start_realtime"] as const)(
    "활성 거대어 시도가 있으면 일반 %s를 거부하고 미끼를 보존한다",
    async (action) => {
      await startVoyage();
      store.set(DANGEROUS_FISHING_SAVE_KEY, {
        ...savedDangerousState(),
        bossAttempt: activeBossAttempt(),
        baitCounts: { blood_bait: 2 },
      });

      const response = await ENCOUNTER(request("encounter", {
        action,
        baitId: "blood_bait",
      }));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "encounter_active",
        eventId: "active-boss-event",
      });
      expect(savedDangerousState().baitCounts.blood_bait).toBe(2);
    },
  );

  it("신규 realtime 시작과 legacy 시작 경로를 함께 유지한다", async () => {
    await startVoyage();

    const realtime = await ENCOUNTER(
      request("encounter", {
        action: "start_realtime",
        baitId: "basic_bait",
      }),
    );
    expect(realtime.status).toBe(200);
    await expect(realtime.json()).resolves.toMatchObject({
      encounter: { simulationVersion: 2 },
    });

    const started = savedDangerousState();
    if (!started.voyage) throw new Error("voyage missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...started,
      voyage: { ...started.voyage, encounter: null },
    });
    const legacy = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    expect(legacy.status).toBe(200);
    const legacyJson = await legacy.json();
    expect(legacyJson).toMatchObject({ encounter: { targetKind: "fish" } });
    expect(legacyJson.encounter).not.toHaveProperty("simulationVersion");
    expect(savedDangerousState().voyage?.encounter).toMatchObject({
      simulationVersion: 1,
    });
  });

  it("만료 경계에 도달한 v1 거대어 시도를 해소한 뒤 일반 조우를 시작하고 화물·미끼·기존 상태를 보존한다", async () => {
    await startVoyage();
    const expiresAt = NOW + 180_000;
    const started = savedDangerousState();
    if (!started.voyage) throw new Error("voyage missing");
    const before = {
      ...started,
      baitCounts: { reef_bait: 3 },
      bossTraces: { tidal_colossus: 7 },
      bossAttempt: activeBossAttempt(expiresAt),
      voyage: {
        ...started.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna" as const,
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 2,
            totalValue: 420,
          },
        ],
      },
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, before);
    vi.mocked(Date.now).mockReturnValue(expiresAt);

    const response = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );

    expect(response.status).toBe(200);
    const after = savedDangerousState();
    expect(after.bossAttempt).toBeNull();
    expect(after.voyage?.cargo).toEqual(before.voyage.cargo);
    expect(after.baitCounts).toEqual(before.baitCounts);
    expect(after.bossTraces).toEqual(before.bossTraces);
    expect(after.codex).toEqual(before.codex);
    expect(after.realtimeCompletions).toEqual(before.realtimeCompletions);
    expect(after.resolvedEncounterIds).toEqual(before.resolvedEncounterIds);
  });

  it("선택 수심 밖의 같은 해역 어종도 낮은 가중치로 출현한다", () => {
    expect(pickFish("abyssal_rift", "deep", "basic_bait", 0.999999).id).toBe(
      "ghostlight_jellyfish",
    );
  });

  it("심연 응축 미끼는 같은 난수에서 전설 어종 쪽으로 선택을 바꾼다", () => {
    const basic = pickFish("abyssal_rift", "deep", "basic_bait", 0.58);
    const abyss = pickFish("abyssal_rift", "deep", "abyss_bait", 0.58);

    expect(basic.rarity).toBe("epic");
    expect(abyss.rarity).toBe("legendary");
  });

  it("특수 미끼는 유효한 조우가 만들어질 때만 하나 소비한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      baitCounts: { blood_bait: 2 },
    });

    const invalid = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "unknown" }),
    );
    expect(invalid.status).toBe(400);
    expect(savedDangerousState().baitCounts.blood_bait).toBe(2);

    const valid = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "blood_bait" }),
    );
    expect(valid.status).toBe(200);
    expect(savedDangerousState().baitCounts.blood_bait).toBe(1);
    const json = await valid.json();
    expect(json).not.toHaveProperty("state.voyage.encounter.patternSeed");
    expect(json).not.toHaveProperty("encounter.patternSeed");
  });

  it("오래된 revision은 409, 너무 빠른 다음 입력은 429로 거부한다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const active = savedDangerousState().voyage?.encounter;
    if (!active) throw new Error("encounter fixture missing");

    const stale = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: active.id,
        revision: active.revision - 1,
      }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: "stale" });

    const first = await ENCOUNTER(
      request("encounter", {
        action: "brace",
        encounterId: active.id,
        revision: active.revision,
      }),
    );
    expect(first.status).toBe(200);
    const progressed = savedDangerousState().voyage?.encounter;
    if (!progressed) throw new Error("progressed encounter missing");
    const tooFast = await ENCOUNTER(
      request("encounter", {
        action: "brace",
        encounterId: progressed.id,
        revision: progressed.revision,
      }),
    );
    expect(tooFast.status).toBe(429);
    await expect(tooFast.json()).resolves.toMatchObject({ error: "too_fast" });
  });

  it("성공한 어획을 화물·도감에 기록하고 낚시 XP·최고 계보 숙련·코인을 올린다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const state = savedDangerousState();
    if (!state.voyage?.encounter) throw new Error("encounter fixture missing");
    if (!isDangerousFishId(state.voyage.encounter.targetId)) {
      throw new Error("fish target missing");
    }
    const caughtFish = DANGEROUS_FISH[state.voyage.encounter.targetId];
    const encounter = {
      ...state.voyage.encounter,
      behaviorPattern: ["turn"],
      stamina: 5,
      distance: 5,
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, encounter },
    });
    lockOrder.length = 0;

    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(response.status).toBe(200);
    expect(lockOrder).toEqual([
      "user",
      `saves:${[
        ACTIVITY_GUARD_KEY,
        DANGEROUS_FISHING_SAVE_KEY,
        FISHING_PROGRESS_KEY,
        FISHING_WALLET_KEY,
        "character.v2",
        "proficiency.v2",
        "skills.v2",
      ].sort().join(",")}`,
    ]);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      event: "caught",
      fishingXpGained: caughtFish.fishingXp,
      masteryGained: 1,
      fishingCoinsGained: caughtFish.fishingCoinReward,
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-danger",
      [{
        category: "job",
        entryId: "fisher",
        amount: 1,
        source: "job.activity",
      }],
      new Date(NOW),
    );
    const saved = savedDangerousState();
    expect(saved.voyage?.cargo).toEqual([
      expect.objectContaining({
        fishId: caughtFish.id,
        materialId: `danger_catch_${caughtFish.id}`,
        quantity: 1,
      }),
    ]);
    expect(saved.codex[caughtFish.id]?.caughtCount).toBe(1);
    expect(
      (store.get(FISHING_PROGRESS_KEY) as { xp: number }).xp,
    ).toBe(14 ** 2 * 35 + caughtFish.fishingXp);
    expect(
      (store.get("proficiency.v2") as { jobCumLevel: Record<string, number> })
        .jobCumLevel.fisher,
    ).toBe(6);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_000 + caughtFish.fishingCoinReward);
    expect(store.get(ACTIVITY_GUARD_KEY)).toBeDefined();
    expect(bossSpawn).not.toHaveBeenCalled();

    const duplicate = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(savedDangerousState().voyage?.cargo).toHaveLength(1);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
  });

  it("위험도 4 이상의 영웅 어획은 같은 처리 안에서 거대어 발견을 판정한다", async () => {
    await startVoyage();
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    const state = savedDangerousState();
    if (!state.voyage?.encounter) throw new Error("encounter fixture missing");
    const encounter = {
      ...state.voyage.encounter,
      targetId: "reef_maw_grouper",
      behaviorPattern: ["turn" as const],
      stamina: 5,
      distance: 5,
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, risk: 4, encounter },
    });

    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );

    expect(response.status).toBe(200);
    expect(bossSpawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "u-danger",
        risk: 4,
        rarity: "epic",
        discoveryBonusPct: 5,
        now: new Date(NOW),
      }),
    );
  });

  it("줄이 끊겨도 이미 실은 화물은 보존한다", async () => {
    await startVoyage();
    let state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 2,
            totalValue: 420,
          },
        ],
      },
    });
    await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    state = savedDangerousState();
    const activeEncounter = state.voyage?.encounter;
    if (!activeEncounter || isDangerousRealtimeEncounter(activeEncounter)) {
      throw new Error("encounter fixture missing");
    }
    const encounter = {
      ...activeEncounter,
      tension: activeEncounter.maxTension - 5,
      behaviorPattern: ["charge"],
      nextActionAt: NOW,
    };
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: { ...state.voyage, encounter },
    });
    const response = await ENCOUNTER(
      request("encounter", {
        action: "reel",
        encounterId: encounter.id,
        revision: encounter.revision,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ event: "line_broken" });
    expect(savedDangerousState().voyage?.cargo).toEqual([
      expect.objectContaining({ fishId: "ironjaw_tuna", quantity: 2 }),
    ]);
  });

  it("realtime 시작은 클라이언트 보정값을 무시하고 서버 계보·장착·강화·미끼만 고정한다", async () => {
    await startVoyage();
    const dangerous = savedDangerousState();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...dangerous,
      gearEnhancements: {
        rods: { starter_rod: 3 },
        reels: { starter_reel: 2 },
        lines: { starter_line: 1 },
      },
    });
    const encounter = await startRealtime({
      fishingLevel: 100,
      cargoProtectionPct: 15,
      rodId: "abyss_rod",
      config: { maxTicks: 1 },
    });

    const stored = savedDangerousState().voyage?.encounter;
    if (!stored || !isDangerousRealtimeEncounter(stored)) {
      throw new Error("realtime encounter missing");
    }
    expect(stored.balanceRevision).toBe(5);
    expect(stored.checkpoint.performanceScalePermille).toBe(1_000);
    if (!isDangerousFishId(encounter.targetId)) {
      throw new Error("realtime fish target missing");
    }
    const selectedFish = DANGEROUS_FISH[encounter.targetId];
    expect(stored.modifierSource).toEqual({
      fishingLevel: 15,
      baitId: "basic_bait",
      rodId: "starter_rod",
      reelId: "starter_reel",
      lineId: "starter_line",
      maxTensionBonus: 0,
      reelPowerBonus: 0,
      staminaDamageBonus: 0,
      tensionControlBonus: 0,
      slackTolerance: 0,
      telegraphSteps: 1,
      rodEnhancementLevel: 3,
      reelEnhancementLevel: 2,
      lineEnhancementLevel: 1,
      cargoProtectionPct: 0,
      targetStamina: selectedFish.stamina,
      targetDistance: selectedFish.distance,
      targetBaseTension: selectedFish.baseTension,
    });
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...savedDangerousState(),
      gearEnhancements: { rods: {}, reels: {}, lines: {} },
    });
    expect(savedDangerousState().voyage?.encounter).toMatchObject({
      modifierSource: {
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 2,
        lineEnhancementLevel: 1,
      },
    });
    expect(encounter).not.toHaveProperty("modifierSource");
    expect(encounter).toHaveProperty("balanceRevision", 5);
    expect(encounter.checkpoint.performanceScalePermille).toBe(1_000);
    expect(encounter.config.maxTicks).toBeGreaterThan(1);
  });

  it("realtime 개인 조우는 생성 후 1초의 준비 시간을 거쳐 시작한다", async () => {
    await startVoyage();

    const encounter = await startRealtime();

    expect(encounter.startedAt).toBe(NOW + 1_000);
    expect(encounter.expiresAt).toBe(
      NOW + 1_000 + encounter.config.maxTicks * 50,
    );
  });

  it("실제 시작 경로에서 레벨 15 < 50 < 100이고 100은 승인된 post-50 보정을 더한다", async () => {
    async function startedAtLevel(level: number) {
      store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
      store.set(FISHING_PROGRESS_KEY, {
        ...emptyFishingProgression(),
        xp: fishingLevelXpThreshold(level),
      });
      await startVoyage();
      return startRealtime();
    }

    const level15 = await startedAtLevel(15);
    const level50 = await startedAtLevel(50);
    const level100 = await startedAtLevel(100);
    const ticks15 = responsiveTranscript(level15).clientTick;
    const ticks50 = responsiveTranscript(level50).clientTick;
    const ticks100 = responsiveTranscript(level100).clientTick;

    expect(ticks15).toBeGreaterThan(ticks50);
    expect(ticks50).toBeGreaterThan(ticks100);
    expect(level100.config.modifiers.reelEfficiencyPct).toBe(
      level50.config.modifiers.reelEfficiencyPct + 12,
    );
    expect(level100.config.modifiers.tensionControlPct).toBe(
      level50.config.modifiers.tensionControlPct + 8,
    );
    expect(level100.config.modifiers.timeReductionPct).toBeLessThanOrEqual(35);
  });

  it("실제 시작 경로에서 최고 장비와 계보의 장력·작업·여유·진짜 전조 보정이 보존된다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: fishingLevelXpThreshold(50),
    });
    store.set("proficiency.v2", {
      points: 20,
      groups: {},
      caps: {},
      grown: {},
      jobCumLevel: {},
      jobHistory: ["seagod"],
    });
    store.set("skills.v2", {
      learned: ["v2c_masterangler_bigcatchsense"],
      equipped: ["v2c_masterangler_bigcatchsense"],
    });
    store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
    await startVoyage();
    const starter = await startRealtime();

    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...emptyDangerousFishingState(),
      ownedGear: {
        rods: ["starter_rod", "leviathan_rod"],
        reels: ["starter_reel", "maelstrom_reel"],
        lines: ["starter_line", "abyss_chain_line"],
      },
      loadout: {
        rodId: "leviathan_rod",
        reelId: "maelstrom_reel",
        lineId: "abyss_chain_line",
        baitId: "basic_bait",
      },
    });
    await startVoyage();

    const top = await startRealtime();
    const stored = savedDangerousState().voyage?.encounter;
    if (!stored || !isDangerousRealtimeEncounter(stored)) {
      throw new Error("top realtime encounter missing");
    }
    if (!isDangerousFishId(top.targetId)) {
      throw new Error("top fish target missing");
    }
    const topFish = DANGEROUS_FISH[top.targetId];

    expect(stored.modifierSource).toMatchObject({
      maxTensionBonus: 31,
      reelPowerBonus: 7,
      staminaDamageBonus: 12,
      tensionControlBonus: 5,
      slackTolerance: 1,
      telegraphSteps: 1,
    });
    expect(top.config).toMatchObject({
      initialTension: topFish.baseTension * 10,
      maxTension: 1_310,
      modifiers: {
        staminaDamagePct: 12,
        distanceRecoveryPct: 7,
        lowTensionGraceTicks: 40,
        telegraphCount: 1,
      },
    });
    expect(top.config.initialStamina + top.config.initialDistance).toBe(20_000);
    expect(top.config.maxTension).toBeGreaterThan(starter.config.maxTension);
    expect(responsiveTranscript(top).clientTick).toBeLessThan(
      responsiveTranscript(starter).clientTick,
    );
    expect(dangerousRealtimeView(top.checkpoint, top.config).telegraphs.length)
      .toBeGreaterThanOrEqual(2);
  });

  it("서로 다른 생산 대상 통계는 총 보정 시간을 늘리지 않고 상대 작업량과 시작 장력만 바꾼다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: fishingLevelXpThreshold(35),
    });
    store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
    await startVoyage("shattered_reef", "surface");
    const shallow = await startRealtime();

    store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
    await startVoyage("abyssal_rift", "deep");
    const abyssal = await startRealtime();

    if (!isDangerousFishId(shallow.targetId) || !isDangerousFishId(abyssal.targetId)) {
      throw new Error("production fish target missing");
    }
    expect(DANGEROUS_FISH[shallow.targetId].zoneId).toBe("shattered_reef");
    expect(DANGEROUS_FISH[abyssal.targetId].zoneId).toBe("abyssal_rift");
    expect(shallow.config.initialStamina + shallow.config.initialDistance).toBe(20_000);
    expect(abyssal.config.initialStamina + abyssal.config.initialDistance).toBe(20_000);
    expect(abyssal.config.initialStamina).not.toBe(shallow.config.initialStamina);
    expect(abyssal.config.initialDistance).not.toBe(shallow.config.initialDistance);
    expect(abyssal.config.initialTension).toBe(
      DANGEROUS_FISH[abyssal.targetId].baseTension * 10,
    );
  });

  it("checkpoint는 2초 분량을 strict replay하고 revision 충돌에 authoritative view를 반환한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    const transcript = responsiveTranscript(encounter, 40);
    vi.mocked(Date.now).mockReturnValue(encounter.startedAt + 2_000);

    const approved = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: transcript.inputs,
        clientTick: 40,
      }),
    );
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({
      ok: true,
      encounter: { approvedTick: 40, revision: 1, checkpoint: { tick: 40 } },
    });

    const stale = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: [],
        clientTick: 40,
      }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: "stale",
      encounter: { approvedTick: 40, revision: 1 },
    });
  });

  it("checkpoint는 중복·역행 입력과 실제 경과 시간보다 미래인 틱을 거부한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();

    const malformed = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: [
          { tick: 0, mode: "reel" },
          { tick: 0, mode: "release" },
        ],
        clientTick: 1,
      }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_inputs" });

    const future = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: [{ tick: 0, mode: "reel" }],
        clientTick: 1,
      }),
    );
    expect(future.status).toBe(409);
    await expect(future.json()).resolves.toMatchObject({ error: "future_tick" });
    expect(savedDangerousState().voyage?.encounter).toMatchObject({ revision: 0 });
  });

  it("동시 finish 재시도는 최초 결과를 돌려주고 어획 보상을 정확히 한 번 원자 정산한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    const transcript = responsiveTranscript(encounter);
    expect(transcript.state.status).toBe("caught");
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );

    const [left, right] = await Promise.all([
      finishRealtime(encounter, transcript, "finish-caught-1"),
      finishRealtime(encounter, transcript, "finish-caught-1"),
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    const [leftJson, rightJson] = await Promise.all([left.json(), right.json()]);
    expect(rightJson).toEqual(leftJson);
    expect(() => JSON.stringify(leftJson)).not.toThrow();
    expect(leftJson).toMatchObject({
      ok: true,
      event: "caught",
      fishingXpGained: expect.any(Number),
      masteryGained: 1,
      fishingCoinsGained: expect.any(Number),
    });
    const fish = DANGEROUS_FISH[encounter.targetId as keyof typeof DANGEROUS_FISH];
    expect(savedDangerousState().voyage?.cargo).toHaveLength(1);
    expect(savedDangerousState().codex[fish.id]?.caughtCount).toBe(1);
    expect(
      (store.get(FISHING_PROGRESS_KEY) as { xp: number }).xp,
    ).toBe(14 ** 2 * 35 + fish.fishingXp);
    expect(
      (store.get("proficiency.v2") as { jobCumLevel: Record<string, number> })
        .jobCumLevel.fisher,
    ).toBe(6);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_000 + fish.fishingCoinReward);
    expect(savedDangerousState().realtimeCompletions).toEqual([
      expect.objectContaining({
        requestId: "finish-caught-1",
        encounterId: encounter.id,
        result: leftJson,
      }),
    ]);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledOnce();
    expect(store.get(ACTIVITY_GUARD_KEY)).toBeDefined();
  });

  it.each([
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_VALUE,
  ])(
    "실시간 어획 확정은 기존 지갑 %s에서도 코인을 안전 정수 상한으로 정산한다",
    async (startingCoins) => {
      await startVoyage();
      const encounter = await startRealtime();
      const transcript = responsiveTranscript(encounter);
      expect(transcript.state.status).toBe("caught");
      store.set(FISHING_WALLET_KEY, { coins: startingCoins });
      vi.mocked(Date.now).mockReturnValue(
        encounter.startedAt + transcript.clientTick * 50,
      );

      const response = await finishRealtime(
        encounter,
        transcript,
        `safe-wallet-${startingCoins}`,
      );
      const json = await response.json();
      const finalCoins = (store.get(FISHING_WALLET_KEY) as { coins: number }).coins;

      expect(response.status).toBe(200);
      expect(() => JSON.stringify(json)).not.toThrow();
      expect(finalCoins).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isSafeInteger(finalCoins)).toBe(true);
    },
  );

  it("실패 finish는 기존 화물을 보존하고 보상 저장소를 바꾸지 않는다", async () => {
    await startVoyage();
    const before = savedDangerousState();
    if (!before.voyage) throw new Error("voyage missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...before,
      voyage: {
        ...before.voyage,
        cargo: [{
          fishId: "ironjaw_tuna",
          materialId: "danger_catch_ironjaw_tuna",
          quantity: 2,
          totalValue: 420,
        }],
      },
    });
    const encounter = await startRealtime();
    const transcript = failureTranscript(encounter);
    expect(transcript.state.status).not.toBe("caught");
    const progressBefore = store.get(FISHING_PROGRESS_KEY);
    const walletBefore = store.get(FISHING_WALLET_KEY);
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );

    const response = await finishRealtime(encounter, transcript, "finish-failed-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      event: transcript.state.status,
    });
    expect(savedDangerousState().voyage?.cargo).toEqual([
      expect.objectContaining({ fishId: "ironjaw_tuna", quantity: 2 }),
    ]);
    expect(store.get(FISHING_PROGRESS_KEY)).toEqual(progressBefore);
    expect(store.get(FISHING_WALLET_KEY)).toEqual(walletBefore);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("finish는 실제 경과 틱을 강제하고 만료 후 30초 경계까지만 지연 제출을 허용한다", async () => {
    await startVoyage();
    let encounter = await startRealtime();
    let transcript = responsiveTranscript(encounter);

    const future = await finishRealtime(encounter, transcript, "finish-future");
    expect(future.status).toBe(409);
    await expect(future.json()).resolves.toMatchObject({ error: "future_tick" });

    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_000);
    const onBoundary = await finishRealtime(encounter, transcript, "finish-boundary");
    expect(onBoundary.status).toBe(200);

    encounter = await startRealtime();
    transcript = responsiveTranscript(encounter);
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);
    const late = await finishRealtime(encounter, transcript, "finish-too-late");
    expect(late.status).toBe(409);
    await expect(late.json()).resolves.toMatchObject({ error: "expired" });
  });

  it("만료 유예가 지난 realtime 조우는 status에서 무보상 해소되어 화물·소비 미끼를 보존하고 귀환을 연다", async () => {
    await startVoyage();
    const before = savedDangerousState();
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...before,
      baitCounts: { reef_bait: 2 },
      voyage: before.voyage
        ? {
            ...before.voyage,
            cargo: [
              {
                fishId: "ironjaw_tuna",
                materialId: "danger_catch_ironjaw_tuna",
                quantity: 2,
                totalValue: 420,
              },
            ],
          }
        : null,
    });
    const encounter = await startRealtime({ baitId: "reef_bait" });
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const status = await STATUS();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      state: { voyage: { encounter: null, cargo: [{ quantity: 2 }] } },
    });
    const recovered = savedDangerousState();
    expect(recovered.voyage?.encounter).toBeNull();
    expect(recovered.voyage?.cargo).toEqual([
      expect.objectContaining({ fishId: "ironjaw_tuna", quantity: 2 }),
    ]);
    expect(recovered.baitCounts.reef_bait).toBe(1);
    expect(recovered.resolvedEncounterIds).toContain(encounter.id);

    const returned = await VOYAGE(
      request("voyage", { action: "return" }),
    );
    expect(returned.status).toBe(200);
    expect(savedDangerousState().voyage).toBeNull();
  });

  it("만료 유예가 지난 realtime 조우는 별도 status 없이도 같은 순방향 시각에 바로 귀환할 수 있다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const returned = await VOYAGE(request("voyage", { action: "return" }));

    expect(returned.status).toBe(200);
    expect(savedDangerousState().voyage).toBeNull();
    expect(savedDangerousState().resolvedEncounterIds).toContain(encounter.id);
  });

  it("만료 유예가 지난 realtime checkpoint는 조우를 해소하고 같은 순방향 시각에 새 투척을 허용한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const expired = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: [],
        clientTick: 0,
      }),
    );
    expect(expired.status).toBe(409);
    await expect(expired.json()).resolves.toMatchObject({ error: "expired" });
    expect(savedDangerousState().voyage?.encounter).toBeNull();

    const next = await startRealtime();
    expect(next.id).not.toBe(encounter.id);
  });

  it("만료 유예가 지난 realtime finish는 무보상 결과를 멱등 기록하고 활성 조우를 비운다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const first = await finishRealtime(
      encounter,
      { inputs: [], clientTick: 0 },
      "finish-expired-idempotent",
    );
    const firstJson = await first.json();
    expect(first.status).toBe(409);
    expect(firstJson).toMatchObject({ ok: false, error: "expired" });
    expect(savedDangerousState().voyage?.encounter).toBeNull();
    expect(savedDangerousState().realtimeCompletions).toContainEqual(
      expect.objectContaining({
        requestId: "finish-expired-idempotent",
        encounterId: encounter.id,
      }),
    );

    const retry = await finishRealtime(
      encounter,
      { inputs: [], clientTick: 0 },
      "finish-expired-idempotent",
    );
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toEqual(firstJson);
  });

  it("새 realtime 투척은 만료 유예가 지난 이전 조우를 같은 트랜잭션에서 교체한다", async () => {
    await startVoyage();
    const expired = await startRealtime();
    vi.mocked(Date.now).mockReturnValue(expired.expiresAt + 30_001);

    const next = await startRealtime();
    expect(next.id).not.toBe(expired.id);
    expect(savedDangerousState().voyage?.encounter).toMatchObject({
      simulationVersion: 2,
      id: next.id,
    });
    expect(savedDangerousState().resolvedEncounterIds).toContain(expired.id);
  });

  it("완료된 조우의 checkpoint는 저장된 authoritative completion을 그대로 반환한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    const transcript = responsiveTranscript(encounter);
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );
    const finished = await finishRealtime(encounter, transcript, "finish-recover");
    const result = await finished.json();

    const checkpoint = await ENCOUNTER(
      request("encounter", {
        action: "checkpoint",
        encounterId: encounter.id,
        revision: 0,
        inputs: [{ tick: -1, mode: "tampered" }],
        clientTick: -1,
      }),
    );
    expect(checkpoint.status).toBe(200);
    await expect(checkpoint.json()).resolves.toEqual(result);
  });

  it("같은 finish requestId를 다른 조우에 재사용하면 충돌로 거부하고 새 조우를 보존한다", async () => {
    await startVoyage();
    const first = await startRealtime();
    const firstTranscript = responsiveTranscript(first);
    vi.mocked(Date.now).mockReturnValue(
      first.startedAt + firstTranscript.clientTick * 50,
    );
    const completed = await finishRealtime(
      first,
      firstTranscript,
      "finish-collision",
    );
    expect(completed.status).toBe(200);

    const second = await startRealtime();
    const secondTranscript = responsiveTranscript(second);
    vi.mocked(Date.now).mockReturnValue(
      second.startedAt + secondTranscript.clientTick * 50,
    );
    const collision = await finishRealtime(
      second,
      secondTranscript,
      "finish-collision",
    );

    expect(collision.status).toBe(409);
    await expect(collision.json()).resolves.toMatchObject({
      ok: false,
      error: "request_id_collision",
    });
    expect(savedDangerousState().voyage?.encounter).toMatchObject({
      simulationVersion: 2,
      id: second.id,
      revision: 0,
    });
    expect(savedDangerousState().realtimeCompletions).toHaveLength(1);
  });

  it("finish는 사용자 행 뒤에 관련 save를 한 번에 정렬 잠금한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    const transcript = responsiveTranscript(encounter);
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );
    lockOrder.length = 0;

    const response = await finishRealtime(
      encounter,
      transcript,
      "finish-lock-order",
    );
    expect(response.status).toBe(200);
    expect(lockOrder).toEqual([
      "user",
      `saves:${[
        ACTIVITY_GUARD_KEY,
        DANGEROUS_FISHING_SAVE_KEY,
        FISHING_PROGRESS_KEY,
        FISHING_WALLET_KEY,
        "character.v2",
        "proficiency.v2",
        "skills.v2",
      ].sort().join(",")}`,
    ]);
  });

  it("finish는 해결 상태와 completion을 dangerous save에 한 번만 함께 저장한다", async () => {
    await startVoyage();
    const encounter = await startRealtime();
    const transcript = responsiveTranscript(encounter);
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );
    upsertKeys.length = 0;

    const response = await finishRealtime(
      encounter,
      transcript,
      "finish-single-write",
    );
    expect(response.status).toBe(200);
    expect(
      upsertKeys.filter((key) => key === DANGEROUS_FISHING_SAVE_KEY),
    ).toHaveLength(1);
  });

  it("연속 완료 결과와 status는 completion journal을 재귀 노출하지 않고 선형 크기를 유지한다", async () => {
    await startVoyage();
    const results: Record<string, unknown>[] = [];
    const journalSizes: number[] = [];
    for (const requestId of ["finish-linear-1", "finish-linear-2"]) {
      const encounter = await startRealtime();
      const transcript = responsiveTranscript(encounter);
      vi.mocked(Date.now).mockReturnValue(
        encounter.startedAt + transcript.clientTick * 50,
      );
      const response = await finishRealtime(
        encounter,
        transcript,
        requestId,
      );
      expect(response.status).toBe(200);
      results.push(await response.json());
      journalSizes.push(
        JSON.stringify(savedDangerousState().realtimeCompletions).length,
      );
    }

    const stored = savedDangerousState().realtimeCompletions;
    expect(stored).toHaveLength(2);
    for (const completion of stored) {
      const serializedResult = JSON.stringify(completion.result);
      expect(serializedResult).not.toContain("realtimeCompletions");
      expect(serializedResult).not.toContain("finish-linear-");
    }
    expect(JSON.stringify(results[1]).length).toBeLessThanOrEqual(
      JSON.stringify(results[0]).length + 100,
    );
    expect(journalSizes[1]).toBeLessThanOrEqual(journalSizes[0] * 2 + 100);

    const status = await STATUS();
    const statusJson = await status.json();
    expect(statusJson.state).not.toHaveProperty("realtimeCompletions");
    expect(JSON.stringify(statusJson)).not.toContain("finish-linear-");
  });

  it("정상 귀환은 화물을 character.v2 재료로 전부 확정한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 3,
            totalValue: 630,
          },
        ],
      },
    });
    lockOrder.length = 0;
    const response = await VOYAGE(request("voyage", { action: "return" }));
    expect(response.status).toBe(200);
    expect(lockOrder).toEqual([
      "user",
      `saves:${["character.v2", DANGEROUS_FISHING_SAVE_KEY, FISHING_WALLET_KEY]
        .sort()
        .join(",")}`,
    ]);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      returned: true,
      retainedCargoValue: 630,
      returnFishingCoinsGained: 63,
    });
    expect(savedDangerousState().voyage).toBeNull();
    expect(
      (store.get("character.v2") as { materials: Record<string, number> }).materials,
    ).toEqual({ v2_iron_ore: 3, danger_catch_ironjaw_tuna: 3 });
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_063);
  });

  it.each([Number.MAX_SAFE_INTEGER, Number.MAX_VALUE])(
    "기존 동일 위험 어획물 %s와 최대 반환량을 병합해도 안전 정수 상한을 넘지 않는다",
    async (existingQuantity) => {
      await startVoyage();
      const state = savedDangerousState();
      if (!state.voyage) throw new Error("voyage fixture missing");
      const materialId = "danger_catch_ironjaw_tuna";
      store.set("character.v2", {
        ...(store.get("character.v2") as Record<string, unknown>),
        materials: { [materialId]: existingQuantity },
      });
      store.set(DANGEROUS_FISHING_SAVE_KEY, {
        ...state,
        voyage: {
          ...state.voyage,
          risk: 5,
          cargo: [{
            fishId: "ironjaw_tuna",
            materialId,
            quantity: Number.MAX_SAFE_INTEGER,
            totalValue: Number.MAX_SAFE_INTEGER,
          }],
        },
      });

      const response = await VOYAGE(request("voyage", { action: "return" }));
      const json = await response.json();
      const savedQuantity = (store.get("character.v2") as {
        materials: Record<string, number>;
      }).materials[materialId];

      expect(response.status).toBe(200);
      expect(json.materials[materialId]).toBe(Number.MAX_SAFE_INTEGER);
      expect(savedQuantity).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isSafeInteger(savedQuantity)).toBe(true);
      expect(savedDangerousState().voyage).toBeNull();
    },
  );

  it.each([
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
  ])(
    "기존 지갑 %s에서 귀환 보상은 음수·비유한 값이나 잔액 감소를 만들지 않는다",
    async (startingCoins) => {
      await startVoyage();
      const state = savedDangerousState();
      if (!state.voyage) throw new Error("voyage fixture missing");
      store.set(FISHING_WALLET_KEY, { coins: startingCoins });
      store.set(DANGEROUS_FISHING_SAVE_KEY, {
        ...state,
        voyage: {
          ...state.voyage,
          risk: 5,
          cargo: [{
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 3,
            totalValue: 630,
          }],
        },
      });

      const response = await VOYAGE(request("voyage", { action: "return" }));
      const json = await response.json();
      const finalCoins = (store.get(FISHING_WALLET_KEY) as { coins: number }).coins;

      expect(response.status).toBe(200);
      expect(json.returnFishingCoinsGained).toBe(0);
      expect(Number.isSafeInteger(json.returnFishingCoinsGained)).toBe(true);
      expect(finalCoins).toBe(
        Math.min(startingCoins, Number.MAX_SAFE_INTEGER),
      );
      expect(Number.isFinite(finalCoins)).toBe(true);
      expect(Number.isSafeInteger(finalCoins)).toBe(true);
    },
  );

  it("동시 정상 귀환은 화물과 위험 보상을 정확히 한 번만 확정한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [{
          fishId: "ironjaw_tuna",
          materialId: "danger_catch_ironjaw_tuna",
          quantity: 3,
          totalValue: 630,
        }],
      },
    });

    const [left, right] = await Promise.all([
      VOYAGE(request("voyage", { action: "return" })),
      VOYAGE(request("voyage", { action: "return" })),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    expect(
      (store.get("character.v2") as { materials: Record<string, number> })
        .materials.danger_catch_ironjaw_tuna,
    ).toBe(3);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_063);
  });

  it.each(["character.v2", FISHING_WALLET_KEY])(
    "%s 후기 저장 실패는 항해·재료·낚시 코인 정산을 모두 롤백한다",
    async (failureKey) => {
      await startVoyage();
      const state = savedDangerousState();
      if (!state.voyage) throw new Error("voyage fixture missing");
      store.set(DANGEROUS_FISHING_SAVE_KEY, {
        ...state,
        voyage: {
          ...state.voyage,
          risk: 5,
          cargo: [{
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 3,
            totalValue: 630,
          }],
        },
      });
      const dangerousBefore = structuredClone(store.get(DANGEROUS_FISHING_SAVE_KEY));
      const characterBefore = structuredClone(store.get("character.v2"));
      const walletBefore = structuredClone(store.get(FISHING_WALLET_KEY));
      failUpsertKey.current = failureKey;

      await expect(
        VOYAGE(request("voyage", { action: "return" })),
      ).rejects.toThrow("forced save failure");

      expect(store.get(DANGEROUS_FISHING_SAVE_KEY)).toEqual(dangerousBefore);
      expect(store.get("character.v2")).toEqual(characterBefore);
      expect(store.get(FISHING_WALLET_KEY)).toEqual(walletBefore);
    },
  );

  it("위험도 5 사고는 50% 상한 내 손실 후 강제 귀환한다", async () => {
    await startVoyage();
    const proficiency = store.get("proficiency.v2") as {
      jobCumLevel: Record<string, number>;
      jobHistory: string[];
    };
    store.set("proficiency.v2", {
      ...proficiency,
      jobCumLevel: { ...proficiency.jobCumLevel, fullcatchking: 1 },
      jobHistory: [...proficiency.jobHistory, "fullcatchking"],
    });
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 10,
            totalValue: 400,
          },
          {
            fishId: "ironjaw_tuna",
            materialId: "danger_catch_ironjaw_tuna",
            quantity: 20,
            totalValue: 600,
          },
        ],
      },
    });
    vi.mocked(Math.random).mockReturnValue(0);
    lockOrder.length = 0;
    const response = await ENCOUNTER(
      request("encounter", { action: "start", baitId: "basic_bait" }),
    );
    expect(response.status).toBe(200);
    expect(lockOrder).toEqual([
      "user",
      `saves:${[MINING_AUTO_KEY, WOODCUTTING_AUTO_KEY].sort().join(",")}`,
      `saves:${[
        DANGEROUS_FISHING_SAVE_KEY,
        FISHING_PROGRESS_KEY,
        FISHING_WALLET_KEY,
        "character.v2",
        "proficiency.v2",
        "skills.v2",
      ].sort().join(",")}`,
    ]);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, incident: true, returned: true });
    expect(json).toMatchObject({
      retainedCargoValue: 570,
      returnFishingCoinsGained: 57,
    });
    expect(json.lostValue).toBeLessThanOrEqual(450);
    expect(savedDangerousState().voyage).toBeNull();
    const materials = (store.get("character.v2") as {
      materials: Record<string, number>;
    }).materials;
    expect(materials.danger_catch_razor_sardine).toBeLessThanOrEqual(10);
    expect(materials.danger_catch_ironjaw_tuna).toBeLessThanOrEqual(20);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_057);
  });

  it.each([
    ["start", 0, 9_007_199_254_740_990, 4_503_599_627_370_496],
    ["start_realtime", 3, 8_466_767_299_456_530, 4_773_815_605_012_726],
  ] as const)(
    "거대한 저장 화물도 %s 사고에서 보호 강화 %i와 일치하는 JSON 정산을 반환한다",
    async (action, lineLevel, expectedLostValue, expectedRetainedQuantity) => {
      await startVoyage();
      const state = savedDangerousState();
      if (!state.voyage) throw new Error("voyage fixture missing");
      store.set(DANGEROUS_FISHING_SAVE_KEY, {
        ...state,
        gearEnhancements: {
          ...state.gearEnhancements,
          lines: { starter_line: lineLevel },
        },
        voyage: {
          ...state.voyage,
          risk: 5,
          cargo: [
            {
              fishId: "razor_sardine",
              materialId: "danger_catch_razor_sardine",
              quantity: Number.MAX_VALUE,
              totalValue: Number.MAX_VALUE,
            },
            {
              fishId: "ironjaw_tuna",
              materialId: "danger_catch_ironjaw_tuna",
              quantity: Number.MAX_VALUE,
              totalValue: Number.MAX_VALUE,
            },
          ],
        },
      });
      vi.mocked(Math.random).mockReturnValue(0);

      const response = await ENCOUNTER(
        request("encounter", { action, baitId: "basic_bait" }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toMatchObject({
        incident: true,
        returned: true,
        lostValue: expectedLostValue,
        retainedCargoValue: Number.MAX_SAFE_INTEGER,
        returnFishingCoinsGained: 900_719_925_474_099,
        materials: {
          danger_catch_razor_sardine: expectedRetainedQuantity,
          danger_catch_ironjaw_tuna: expectedRetainedQuantity,
        },
      });
      expect(Number.isSafeInteger(json.lostValue)).toBe(true);
      expect(Number.isSafeInteger(json.retainedCargoValue)).toBe(true);
      expect(Number.isSafeInteger(json.returnFishingCoinsGained)).toBe(true);
    },
  );

  it("사고 정산의 후기 지갑 저장 실패도 항해·재료·코인을 함께 롤백한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [{
          fishId: "ironjaw_tuna",
          materialId: "danger_catch_ironjaw_tuna",
          quantity: 20,
          totalValue: 600,
        }],
      },
    });
    const dangerousBefore = structuredClone(store.get(DANGEROUS_FISHING_SAVE_KEY));
    const characterBefore = structuredClone(store.get("character.v2"));
    const walletBefore = structuredClone(store.get(FISHING_WALLET_KEY));
    failUpsertKey.current = FISHING_WALLET_KEY;
    vi.mocked(Math.random).mockReturnValue(0);

    await expect(
      ENCOUNTER(request("encounter", { action: "start", baitId: "basic_bait" })),
    ).rejects.toThrow("forced save failure");

    expect(store.get(DANGEROUS_FISHING_SAVE_KEY)).toEqual(dangerousBefore);
    expect(store.get("character.v2")).toEqual(characterBefore);
    expect(store.get(FISHING_WALLET_KEY)).toEqual(walletBefore);
  });

  it("realtime 시작 전 사고에도 계보와 장착 줄 강화의 전체 화물 보호를 적용한다", async () => {
    await startVoyage();
    const state = savedDangerousState();
    if (!state.voyage) throw new Error("voyage fixture missing");
    store.set(DANGEROUS_FISHING_SAVE_KEY, {
      ...state,
      gearEnhancements: {
        ...state.gearEnhancements,
        lines: { starter_line: 3 },
      },
      voyage: {
        ...state.voyage,
        risk: 5,
        cargo: [
          {
            fishId: "razor_sardine",
            materialId: "danger_catch_razor_sardine",
            quantity: 100,
            totalValue: 1_000,
          },
        ],
      },
    });
    vi.mocked(Math.random).mockReturnValue(0);
    lockOrder.length = 0;

    const response = await ENCOUNTER(
      request("encounter", { action: "start_realtime", baitId: "basic_bait" }),
    );
    expect(response.status).toBe(200);
    expect(lockOrder).toEqual([
      "user",
      `saves:${[MINING_AUTO_KEY, WOODCUTTING_AUTO_KEY].sort().join(",")}`,
      `saves:${[
        DANGEROUS_FISHING_SAVE_KEY,
        FISHING_PROGRESS_KEY,
        FISHING_WALLET_KEY,
        "character.v2",
        "proficiency.v2",
        "skills.v2",
      ].sort().join(",")}`,
    ]);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      incident: true,
      returned: true,
      lostValue: 470,
      retainedCargoValue: 530,
      returnFishingCoinsGained: 53,
    });
    const materials = (store.get("character.v2") as {
      materials: Record<string, number>;
    }).materials;
    expect(materials.danger_catch_razor_sardine).toBe(53);
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(150_053);
  });

  it("상점 구매·장착은 낚시 코인 지갑과 전용 상태를 함께 갱신한다", async () => {
    const buy = await SHOP(
      request("shop", {
        kind: "reel",
        id: "current_reel",
        action: "buy",
      }),
    );
    expect(buy.status).toBe(200);
    expect(savedDangerousState().ownedGear.reels).toContain("current_reel");
    expect(
      (store.get(FISHING_WALLET_KEY) as { coins: number }).coins,
    ).toBe(135_000);

    const equip = await SHOP(
      request("shop", {
        kind: "reel",
        id: "current_reel",
        action: "equip",
      }),
    );
    expect(equip.status).toBe(200);
    expect(savedDangerousState().loadout.reelId).toBe("current_reel");
  });

  it("없는 항해 상태도 스타터 세트로 조회한다", async () => {
    store.delete(DANGEROUS_FISHING_SAVE_KEY);
    const response = await STATUS();
    expect(response.status).toBe(200);
    const json = await response.json();
    const {
      realtimeCompletions: _realtimeCompletions,
      ...emptyPublicState
    } = emptyDangerousFishingState();
    expect(json).toMatchObject({
      ok: true,
      state: emptyPublicState,
      fishingCoins: 150_000,
    });
  });
});
