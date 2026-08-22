import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, memory, transactionQueue } = vi.hoisted(() => {
  const events = new Map<string, Record<string, unknown>>();
  const contributions = new Map<string, Record<string, unknown>>();
  const states = new Map<string, Record<string, unknown>>();
  const characters = new Map<string, Record<string, unknown>>();
  const wallets = new Map<string, unknown>();
  const activeAutos = new Map<string, "woodcutting" | "mining">();
  const lockTrace: string[] = [];
  return {
    auth: { userId: "route-user" as string | null, unlocked: true },
    transactionQueue: { tail: Promise.resolve() as Promise<unknown> },
    memory: {
      events,
      contributions,
      states,
      characters,
      wallets,
      activeAutos,
      lockTrace,
      reset() {
        events.clear();
        contributions.clear();
        states.clear();
        characters.clear();
        wallets.clear();
        activeAutos.clear();
        lockTrace.length = 0;
      },
      async findActive(now: Date) {
        return (
          [...events.values()].find(
            (event) => event.status === "active" && (event.expiresAt as Date) > now,
          ) ?? null
        );
      },
      async findLatest() {
        lockTrace.push("event:read");
        return [...events.values()].sort(
          (a, b) =>
            (b.spawnedAt as Date).getTime() - (a.spawnedAt as Date).getTime(),
        )[0] ?? null;
      },
      async expireActive(now: Date) {
        lockTrace.push("event:expire");
        for (const [id, event] of events) {
          if (event.status === "active" && (event.expiresAt as Date) <= now) {
            events.set(id, { ...event, status: "expired" });
          }
        }
      },
      async createEvent(event: Record<string, unknown>) {
        events.set(event.id as string, event);
        return true;
      },
      async eventForUpdate(eventId: string) {
        lockTrace.push("event:for-update");
        return events.get(eventId) ?? null;
      },
      async saveEvent(event: Record<string, unknown>) {
        events.set(event.id as string, event);
      },
      async contributionForUpdate(eventId: string, userId: string) {
        lockTrace.push("contribution");
        return contributions.get(`${eventId}:${userId}`) ?? null;
      },
      async saveContribution(contribution: Record<string, unknown>) {
        contributions.set(
          `${contribution.eventId}:${contribution.userId}`,
          contribution,
        );
      },
      async dangerousStateForUpdate(userId: string) {
        lockTrace.push("user");
        lockTrace.push("save:dangerous-fishing.v1");
        return states.get(userId);
      },
      async activeAutoActivityForUpdate(userId: string) {
        lockTrace.push("user:auto");
        lockTrace.push("auto-saves");
        return activeAutos.get(userId) ?? null;
      },
      async saveDangerousState(userId: string, state: Record<string, unknown>) {
        states.set(userId, state);
      },
      async heritageForUpdate() {
        return {
          unlocked: auth.unlocked,
          fishingLevel: auth.unlocked ? 15 : 14,
          levelAssistPct: 0,
          highestFishingJobId: "fisher",
          lineage: {
            telegraphSteps: 1,
            targetReadingPct: 0,
            staminaBonusPct: 0,
            cargoProtectionPct: 0,
            deepTraceBonusPct: 0,
          },
          passives: {
            traceBonusPct: 0,
            targetReadingPct: 0,
            staminaBonusPct: 0,
            cargoProtectionPct: 0,
            sizeBonusPct: 0,
            deepTraceBonusPct: 0,
          },
        };
      },
      async characterForUpdate(userId: string) {
        return characters.get(userId) ?? {};
      },
      async saveCharacter(userId: string, character: Record<string, unknown>) {
        characters.set(userId, character);
      },
      async walletForUpdate(userId: string) {
        return wallets.get(userId) ?? {};
      },
      async saveWallet(userId: string, wallet: unknown) {
        wallets.set(userId, wallet);
      },
    },
  };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => auth.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn((callback: (tx: unknown) => unknown) => {
      const run = transactionQueue.tail.then(() => callback({}));
      transactionQueue.tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  },
}));
vi.mock("@/lib/server/dangerousFishingBoss", async (importActual) => {
  const actual = await importActual<
    typeof import("@/lib/server/dangerousFishingBoss")
  >();
  return {
    ...actual,
    drizzleDangerousFishingBossStore: vi.fn(() => memory),
  };
});

import { GET, POST } from "@/app/api/v2/dangerous-fishing/boss/route";
import {
  emptyDangerousFishingState,
  parseDangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  advanceDangerousRealtimeTick,
  dangerousRealtimeView,
  type DangerousRealtimeConfig,
  type DangerousRealtimeBalanceRevision,
  type DangerousRealtimeInput,
  type DangerousRealtimeState,
} from "@/adventure/v2/dangerousFishingRealtime";
import { DANGEROUS_BOSSES } from "@/adventure/data/v2/dangerousFishing";

const NOW = new Date("2026-08-13T00:00:00.000Z");

function event(patch: Record<string, unknown> = {}) {
  return {
    id: "event-route",
    bossId: "tidal_colossus",
    discovererId: "route-user",
    maxStamina: 18_000,
    stamina: 18_000,
    status: "active",
    spawnedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 6 * 60 * 60_000),
    defeatedAt: null,
    lastHaulUserId: null,
    ...patch,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://test/api/v2/dangerous-fishing/boss", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type RealtimeBossEncounter = {
  simulationVersion: 2;
  balanceRevision: DangerousRealtimeBalanceRevision;
  id: string;
  targetKind: "boss";
  targetId: string;
  config: DangerousRealtimeConfig;
  checkpoint: DangerousRealtimeState;
  approvedTick: number;
  revision: number;
  startedAt: number;
  expiresAt: number;
};

async function startRealtimeBoss(
  userId = "route-user",
  eventId = "event-route",
  baitId = "basic_bait",
): Promise<RealtimeBossEncounter> {
  auth.userId = userId;
  if (!memory.states.has(userId)) {
    memory.states.set(userId, emptyDangerousFishingState());
  }
  const response = await POST(
    request({ action: "start_realtime", eventId, baitId }),
  );
  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json).toMatchObject({
    ok: true,
    encounter: { simulationVersion: 2, targetKind: "boss" },
  });
  return json.encounter as RealtimeBossEncounter;
}

function responsiveTranscript(encounter: RealtimeBossEncounter) {
  let state = encounter.checkpoint;
  let mode = state.mode;
  const inputs: DangerousRealtimeInput[] = [];
  while (state.status === "active" && state.tick < encounter.config.maxTicks) {
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

function failureTranscript(encounter: RealtimeBossEncounter) {
  let state = encounter.checkpoint;
  const inputs: DangerousRealtimeInput[] =
    state.mode === "reel" ? [] : [{ tick: state.tick, mode: "reel" }];
  while (state.status === "active") {
    state = advanceDangerousRealtimeTick(
      state,
      encounter.config,
      "reel",
      encounter.balanceRevision,
    );
  }
  return { inputs, clientTick: state.tick, state };
}

async function finishRealtimeBoss(
  encounter: RealtimeBossEncounter,
  transcript: { inputs: DangerousRealtimeInput[]; clientTick: number },
  requestId: string,
  eventId = "event-route",
) {
  return POST(
    request({
      action: "finish",
      eventId,
      encounterId: encounter.id,
      revision: encounter.revision,
      inputs: transcript.inputs,
      clientTick: transcript.clientTick,
      requestId,
      caught: true,
    }),
  );
}

describe("거대어 Route Handler", () => {
  beforeEach(() => {
    memory.reset();
    auth.userId = "route-user";
    auth.unlocked = true;
    transactionQueue.tail = Promise.resolve();
    memory.states.set("route-user", emptyDangerousFishingState());
    vi.spyOn(Date, "now").mockReturnValue(NOW.getTime());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => vi.restoreAllMocks());

  it("인증되지 않은 조회와 참여를 거부한다", async () => {
    auth.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: "start", eventId: "event-route" }))).status).toBe(
      401,
    );
  });

  it("낚시 레벨 15 미만의 거대어 참여를 403으로 거부한다", async () => {
    auth.unlocked = false;
    memory.events.set("event-route", event());

    const response = await POST(
      request({ action: "start", eventId: "event-route" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "fishing_level_locked",
    });
  });

  it("활성 이벤트는 공용 체력·만료·내 기여·발견자만 주고 순위는 주지 않는다", async () => {
    memory.events.set("event-route", event());
    memory.contributions.set("event-route:route-user", {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 480,
      successfulAttempts: 2,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      event: {
        id: "event-route",
        bossId: "tidal_colossus",
        stamina: 18_000,
        maxStamina: 18_000,
        isDiscoverer: true,
      },
      contribution: { totalContribution: 480, successfulAttempts: 2 },
      eligible: true,
      claimed: false,
    });
    expect(json).not.toHaveProperty("rankings");
    expect(json).not.toHaveProperty("contributors");
  });

  it.each([
    ["종료된", "defeated"],
    ["누락된", "missing"],
  ] as const)(
    "%s 이벤트를 참조하는 v1 시도는 GET에서 무보상 해소하고 기여·수령 상태를 보존한다",
    async (_label, eventState) => {
      memory.events.set("event-route", event());
      memory.states.set("route-user", {
        ...emptyDangerousFishingState(),
        baitCounts: { reef_bait: 3 },
        bossTraces: { tidal_colossus: 7 },
      });
      const started = await POST(
        request({ action: "start", eventId: "event-route" }),
      );
      expect(started.status).toBe(200);
      const contribution = {
        eventId: "event-route",
        userId: "route-user",
        totalContribution: 480,
        successfulAttempts: 2,
        firstContributedAt: NOW,
        lastContributedAt: NOW,
        rewardClaimedAt: new Date(NOW.getTime() - 1_000),
      };
      memory.contributions.set("event-route:route-user", contribution);
      const before = parseDangerousFishingState(
        memory.states.get("route-user"),
      );
      if (eventState === "defeated") {
        memory.events.set("event-route", event({
          status: "defeated",
          stamina: 0,
          defeatedAt: NOW,
        }));
      } else {
        memory.events.delete("event-route");
      }
      memory.lockTrace.length = 0;

      const response = await GET();

      expect(response.status).toBe(200);
      const after = parseDangerousFishingState(
        memory.states.get("route-user"),
      );
      expect(after.bossAttempt).toBeNull();
      expect(after.baitCounts).toEqual(before.baitCounts);
      expect(after.bossTraces).toEqual(before.bossTraces);
      expect(after.realtimeCompletions).toEqual(before.realtimeCompletions);
      expect(after.resolvedEncounterIds).toEqual(before.resolvedEncounterIds);
      expect(memory.contributions.get("event-route:route-user")).toEqual(
        contribution,
      );
      expect(memory.lockTrace.slice(0, 3)).toEqual([
        "user",
        "save:dangerous-fishing.v1",
        "event:for-update",
      ]);
    },
  );

  it("만료 이벤트는 새 개인 시도를 410으로 거부한다", async () => {
    memory.events.set(
      "event-route",
      event({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    const response = await POST(
      request({ action: "start", eventId: "event-route" }),
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "expired" });
  });

  it("개인 장력 시도 성공이 공용 체력과 누적 기여를 갱신한다", async () => {
    memory.events.set("event-route", event());
    const started = await POST(
      request({ action: "start", eventId: "event-route" }),
    );
    expect(started.status).toBe(200);
    const state = memory.states.get("route-user") as ReturnType<
      typeof emptyDangerousFishingState
    >;
    if (!state.bossAttempt) throw new Error("attempt missing");
    memory.states.set("route-user", {
      ...state,
      bossAttempt: {
        ...state.bossAttempt,
        encounter: {
          ...state.bossAttempt.encounter,
          behaviorPattern: ["turn"],
          stamina: 5,
          distance: 5,
          nextActionAt: NOW.getTime(),
        },
      },
    });
    const action = await POST(
      request({
        action: "reel",
        eventId: "event-route",
        encounterId: state.bossAttempt.encounter.id,
        revision: state.bossAttempt.encounter.revision,
      }),
    );
    expect(action.status).toBe(200);
    await expect(action.json()).resolves.toMatchObject({
      event: "caught",
      contribution: 240,
    });
    expect(memory.events.get("event-route")?.stamina).toBe(17_760);
    expect(memory.contributions.get("event-route:route-user")).toMatchObject({
      totalContribution: 240,
      successfulAttempts: 1,
    });
  });

  it("처치 후 보상을 수령하고 중복 수령은 이미 수령으로 응답한다", async () => {
    memory.events.set(
      "event-route",
      event({ stamina: 0, status: "defeated", defeatedAt: NOW }),
    );
    memory.contributions.set("event-route:route-user", {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 240,
      successfulAttempts: 1,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    memory.wallets.set("route-user", { coins: 0 });

    const first = await POST(
      request({ action: "claim", eventId: "event-route" }),
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      ok: true,
      alreadyClaimed: false,
      reward: { tier: "base" },
    });

    const duplicate = await POST(
      request({ action: "claim", eventId: "event-route" }),
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      ok: true,
      alreadyClaimed: true,
    });
  });

  it("realtime 거대어 시도는 서버 설정으로 시작하고 GET에는 legacy와 분리된 tagged 복구 뷰를 준다", async () => {
    memory.events.set("event-route", event());
    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      gearEnhancements: {
        rods: { starter_rod: 3 },
        reels: { starter_reel: 2 },
        lines: { starter_line: 1 },
      },
    });

    const encounter = await startRealtimeBoss();
    expect(encounter.config).toMatchObject({
      risk: 4,
      targetKind: "boss",
      rarity: "boss",
      behaviorPattern: DANGEROUS_BOSSES.tidal_colossus.behaviorPattern,
    });
    expect(encounter.config.maxTicks).toBeGreaterThan(0);
    expect(encounter).not.toHaveProperty("modifierSource");
    expect(encounter).toHaveProperty("balanceRevision", 3);
    expect(encounter.checkpoint.performanceScalePermille).toBe(1_000);
    const stored = parseDangerousFishingState(memory.states.get("route-user"));
    expect(stored.bossAttempt?.encounter).toMatchObject({
      balanceRevision: 3,
      checkpoint: { performanceScalePermille: 1_000 },
      modifierSource: {
        fishingLevel: 15,
        baitId: "basic_bait",
        rodEnhancementLevel: 3,
        reelEnhancementLevel: 2,
        lineEnhancementLevel: 1,
      },
    });
    memory.states.set("route-user", {
      ...stored,
      gearEnhancements: { rods: {}, reels: {}, lines: {} },
    });
    expect(parseDangerousFishingState(memory.states.get("route-user")).bossAttempt)
      .toMatchObject({
        encounter: {
          modifierSource: {
            rodEnhancementLevel: 3,
            reelEnhancementLevel: 2,
            lineEnhancementLevel: 1,
          },
        },
      });

    const status = await GET();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      attempt: null,
      realtimeAttempt: {
        eventId: "event-route",
        encounter: {
          simulationVersion: 2,
          id: encounter.id,
          targetKind: "boss",
        },
      },
    });
  });

  it("신규 realtime 거대어 시작과 legacy 시작 경로를 함께 유지한다", async () => {
    memory.events.set("event-route", event());

    const realtime = await POST(request({
      action: "start_realtime",
      eventId: "event-route",
      baitId: "basic_bait",
    }));
    expect(realtime.status).toBe(200);
    await expect(realtime.json()).resolves.toMatchObject({
      encounter: { simulationVersion: 2 },
    });

    const started = parseDangerousFishingState(memory.states.get("route-user"));
    memory.states.set("route-user", { ...started, bossAttempt: null });
    const legacy = await POST(request({
      action: "start",
      eventId: "event-route",
    }));
    expect(legacy.status).toBe(200);
    const legacyJson = await legacy.json();
    expect(legacyJson).toMatchObject({ encounter: { targetKind: "boss" } });
    expect(legacyJson.encounter).not.toHaveProperty("simulationVersion");
    expect(parseDangerousFishingState(memory.states.get("route-user")).bossAttempt)
      .toMatchObject({ encounter: { simulationVersion: 1 } });
  });

  it("realtime 거대어 시작은 유한 특수 미끼를 한 개만 소비하고 마지막 미끼 보정을 복구한다", async () => {
    memory.events.set("event-route", event());
    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      baitCounts: { reef_bait: 2 },
    });

    await startRealtimeBoss("route-user", "event-route", "reef_bait");
    let saved = parseDangerousFishingState(memory.states.get("route-user"));
    expect(saved.baitCounts.reef_bait).toBe(1);
    expect(saved.bossAttempt?.encounter).toMatchObject({
      modifierSource: { baitId: "reef_bait" },
      config: {
        modifiers: {
          baitEffect: { turnDistanceRecoveryReductionPct: 20 },
        },
      },
    });

    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      baitCounts: { reef_bait: 1 },
    });
    await startRealtimeBoss("route-user", "event-route", "reef_bait");
    saved = parseDangerousFishingState(memory.states.get("route-user"));
    expect(saved.baitCounts.reef_bait).toBeUndefined();
    expect(saved.loadout.baitId).toBe("basic_bait");
    expect(saved.bossAttempt?.encounter).toMatchObject({
      modifierSource: { baitId: "reef_bait" },
      config: {
        modifiers: {
          baitEffect: { turnDistanceRecoveryReductionPct: 20 },
        },
      },
    });
  });

  it("realtime 거대어는 요청 baitId를 검증하고 장착 미끼와 무관하게 선택 소비한다", async () => {
    memory.events.set("event-route", event());
    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      baitCounts: { blood_bait: 1 },
    });

    const invalid = await POST(request({
      action: "start_realtime",
      eventId: "event-route",
      baitId: "unknown",
    }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "invalid_bait" });
    expect(parseDangerousFishingState(memory.states.get("route-user")).baitCounts)
      .toEqual({ blood_bait: 1 });

    const unavailable = await POST(request({
      action: "start_realtime",
      eventId: "event-route",
      baitId: "reef_bait",
    }));
    expect(unavailable.status).toBe(409);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: "out_of_bait",
    });
    expect(parseDangerousFishingState(memory.states.get("route-user")).baitCounts)
      .toEqual({ blood_bait: 1 });

    const started = await startRealtimeBoss(
      "route-user",
      "event-route",
      "blood_bait",
    );
    expect(started.config.modifiers.baitEffect).toMatchObject({
      chargeAndThrashStaminaDamagePct: 20,
    });
    const saved = parseDangerousFishingState(memory.states.get("route-user"));
    expect(saved.loadout.baitId).toBe("basic_bait");
    expect(saved.baitCounts.blood_bait).toBeUndefined();
    expect(saved.bossAttempt?.encounter).toMatchObject({
      modifierSource: { baitId: "blood_bait" },
    });
  });

  it.each(["start", "start_realtime"] as const)(
    "활성 항해가 있으면 거대어 %s를 voyage_active로 거부한다",
    async (action) => {
      memory.events.set("event-route", event());
      memory.states.set("route-user", {
        ...emptyDangerousFishingState(),
        voyage: {
          id: "active-voyage",
          zoneId: "shattered_reef",
          depthId: "surface",
          risk: 0,
          startedAt: NOW.getTime(),
          cargo: [],
          encounter: null,
        },
      });

      const response = await POST(request({
        action,
        eventId: "event-route",
        baitId: "basic_bait",
      }));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "voyage_active",
      });
    },
  );

  it.each(["start", "start_realtime"] as const)(
    "자동 채집 중에는 거대어 %s를 사용자→자동 저장 잠금 뒤 거부한다",
    async (action) => {
      memory.events.set("event-route", event());
      memory.activeAutos.set("route-user", "mining");

      const response = await POST(request({
        action,
        eventId: "event-route",
        baitId: "basic_bait",
      }));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "auto_active",
        activeAutoActivity: "mining",
      });
      expect(memory.lockTrace.slice(0, 2)).toEqual(["user:auto", "auto-saves"]);
    },
  );

  it("거부된 realtime 거대어 시작과 무제한 기본 미끼 시작은 미끼 수량을 바꾸지 않는다", async () => {
    memory.events.set("expired", event({
      id: "expired",
      status: "expired",
      expiresAt: new Date(NOW.getTime() - 1),
    }));
    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      loadout: {
        ...emptyDangerousFishingState().loadout,
        baitId: "blood_bait",
      },
      baitCounts: { blood_bait: 3 },
    });

    const rejected = await POST(
      request({ action: "start_realtime", eventId: "expired", baitId: "blood_bait" }),
    );
    expect(rejected.status).toBe(410);
    expect(
      parseDangerousFishingState(memory.states.get("route-user")).baitCounts
        .blood_bait,
    ).toBe(3);

    memory.events.set("event-route", event());
    memory.states.set("route-user", emptyDangerousFishingState());
    await startRealtimeBoss();
    expect(
      parseDangerousFishingState(memory.states.get("route-user")).baitCounts,
    ).toEqual({});
  });

  it("realtime 시작은 만료·처치 이벤트와 기존 개인 조우를 거부한다", async () => {
    memory.events.set("expired", event({
      id: "expired",
      status: "expired",
      expiresAt: new Date(NOW.getTime() - 1),
    }));
    memory.events.set("defeated", event({
      id: "defeated",
      status: "defeated",
      stamina: 0,
      defeatedAt: NOW,
    }));

    const expired = await POST(request({ action: "start_realtime", eventId: "expired", baitId: "basic_bait" }));
    expect(expired.status).toBe(410);
    const defeated = await POST(request({ action: "start_realtime", eventId: "defeated", baitId: "basic_bait" }));
    expect(defeated.status).toBe(409);

    memory.events.set("event-route", event());
    await startRealtimeBoss();
    const duplicate = await POST(
      request({ action: "start_realtime", eventId: "event-route", baitId: "basic_bait" }),
    );
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: "encounter_active",
    });
  });

  it("realtime checkpoint는 입력 순서·revision·실제 경과 틱을 엄격히 검증한다", async () => {
    memory.events.set("event-route", event());
    const encounter = await startRealtimeBoss();

    const malformed = await POST(request({
      action: "checkpoint",
      eventId: "event-route",
      encounterId: encounter.id,
      revision: 0,
      inputs: [
        { tick: 0, mode: "reel" },
        { tick: 0, mode: "release" },
      ],
      clientTick: 1,
    }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_inputs" });

    const future = await POST(request({
      action: "checkpoint",
      eventId: "event-route",
      encounterId: encounter.id,
      revision: 0,
      inputs: [{ tick: 0, mode: "reel" }],
      clientTick: 1,
    }));
    expect(future.status).toBe(409);
    await expect(future.json()).resolves.toMatchObject({ error: "future_tick" });

    vi.mocked(Date.now).mockReturnValue(NOW.getTime() + 2_000);
    const transcript = responsiveTranscript(encounter);
    const approved = await POST(request({
      action: "checkpoint",
      eventId: "event-route",
      encounterId: encounter.id,
      revision: 0,
      inputs: transcript.inputs.filter((input) => input.tick < 40),
      clientTick: 40,
    }));
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({
      encounter: { approvedTick: 40, revision: 1 },
    });

    const stale = await POST(request({
      action: "checkpoint",
      eventId: "event-route",
      encounterId: encounter.id,
      revision: 0,
      inputs: [],
      clientTick: 40,
    }));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: "stale",
      encounter: { approvedTick: 40, revision: 1 },
    });
  });

  it("검증된 caught finish만 공용 체력과 기존 기여를 정확히 한 번 누적한다", async () => {
    memory.events.set("event-route", event());
    memory.contributions.set("event-route:route-user", {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 480,
      successfulAttempts: 2,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    const encounter = await startRealtimeBoss();
    const transcript = responsiveTranscript(encounter);
    expect(transcript.state.status).toBe("caught");
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );

    const first = await finishRealtimeBoss(
      encounter,
      transcript,
      "boss-finish-caught",
    );
    const duplicate = await finishRealtimeBoss(
      encounter,
      transcript,
      "boss-finish-caught",
    );
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(await first.json());
    expect(memory.events.get("event-route")?.stamina).toBe(17_760);
    expect(memory.contributions.get("event-route:route-user")).toMatchObject({
      totalContribution: 720,
      successfulAttempts: 3,
    });
    const saved = parseDangerousFishingState(memory.states.get("route-user"));
    expect(saved.bossAttempt).toBeNull();
    expect(saved.realtimeCompletions).toEqual([
      expect.objectContaining({
        requestId: "boss-finish-caught",
        encounterId: encounter.id,
      }),
    ]);
  });

  it("실패 transcript와 클라이언트 caught 주장은 공용 체력·기존 기여를 보존한다", async () => {
    memory.events.set("event-route", event());
    const previous = {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 480,
      successfulAttempts: 2,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    };
    memory.contributions.set("event-route:route-user", previous);
    const encounter = await startRealtimeBoss();
    const transcript = failureTranscript(encounter);
    expect(transcript.state.status).not.toBe("caught");
    expect(transcript.state.status).toBe("line_broken");
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );

    const response = await finishRealtimeBoss(
      encounter,
      transcript,
      "boss-finish-failed",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      event: transcript.state.status,
      contribution: 0,
    });
    expect(memory.events.get("event-route")?.stamina).toBe(18_000);
    expect(memory.contributions.get("event-route:route-user")).toEqual(previous);
  });

  it("저장된 boss 위험도·대상 관계가 변조되면 replay 결과가 caught여도 기여하지 않는다", async () => {
    memory.events.set("event-route", event());
    const started = await startRealtimeBoss();
    const state = memory.states.get("route-user") as ReturnType<
      typeof emptyDangerousFishingState
    >;
    if (
      !state.bossAttempt ||
      state.bossAttempt.encounter.simulationVersion !== 2 ||
      state.bossAttempt.encounter.targetKind !== "boss"
    ) {
      throw new Error("realtime boss attempt missing");
    }
    const tampered: RealtimeBossEncounter = {
      ...state.bossAttempt.encounter,
      targetKind: "boss",
      config: {
        ...state.bossAttempt.encounter.config,
        targetKind: "boss",
        risk: 5,
      },
    };
    memory.states.set("route-user", {
      ...state,
      bossAttempt: { ...state.bossAttempt, encounter: tampered },
    });
    const transcript = responsiveTranscript(tampered);
    expect(transcript.state.status).toBe("caught");
    vi.mocked(Date.now).mockReturnValue(
      started.startedAt + transcript.clientTick * 50,
    );

    const response = await finishRealtimeBoss(
      tampered,
      transcript,
      "boss-tampered-config",
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_attempt",
    });
    expect(memory.events.get("event-route")?.stamina).toBe(18_000);
    expect(memory.contributions.has("event-route:route-user")).toBe(false);
  });

  it("finish는 실제 경과 틱과 30초 grace를 강제하고 requestId 충돌을 거부한다", async () => {
    memory.events.set("event-route", event());
    let encounter = await startRealtimeBoss();
    let transcript = responsiveTranscript(encounter);

    const future = await finishRealtimeBoss(encounter, transcript, "boss-future");
    expect(future.status).toBe(409);
    await expect(future.json()).resolves.toMatchObject({ error: "future_tick" });

    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_000);
    const boundary = await finishRealtimeBoss(encounter, transcript, "boss-boundary");
    expect(boundary.status).toBe(200);

    encounter = await startRealtimeBoss();
    transcript = failureTranscript(encounter);
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );
    const collision = await finishRealtimeBoss(
      encounter,
      transcript,
      "boss-boundary",
    );
    expect(collision.status).toBe(409);
    await expect(collision.json()).resolves.toMatchObject({
      error: "request_id_collision",
    });
    expect(parseDangerousFishingState(memory.states.get("route-user")).bossAttempt)
      .toMatchObject({ encounter: { id: encounter.id } });
  });

  it("만료 유예가 지난 realtime 거대어 시도는 GET에서 해소되어 기여·소비 미끼를 보존하고 같은 이벤트 재시도를 연다", async () => {
    memory.events.set("event-route", event());
    memory.contributions.set("event-route:route-user", {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 120,
      successfulAttempts: 1,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    memory.states.set("route-user", {
      ...emptyDangerousFishingState(),
      loadout: { ...emptyDangerousFishingState().loadout, baitId: "reef_bait" },
      baitCounts: { reef_bait: 2 },
    });
    const encounter = await startRealtimeBoss(
      "route-user",
      "event-route",
      "reef_bait",
    );
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const status = await GET();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      contribution: { totalContribution: 120, successfulAttempts: 1 },
      realtimeAttempt: null,
    });
    const recovered = parseDangerousFishingState(
      memory.states.get("route-user"),
    );
    expect(recovered.bossAttempt).toBeNull();
    expect(recovered.baitCounts.reef_bait).toBe(1);
    expect(memory.contributions.get("event-route:route-user")).toMatchObject({
      totalContribution: 120,
      successfulAttempts: 1,
    });

    const retry = await startRealtimeBoss(
      "route-user",
      "event-route",
      "reef_bait",
    );
    expect(retry.id).not.toBe(encounter.id);
  });

  it("만료 유예가 지난 realtime 거대어 checkpoint는 시도를 해소하고 같은 이벤트 재시도를 허용한다", async () => {
    memory.events.set("event-route", event());
    const encounter = await startRealtimeBoss();
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const expired = await POST(
      request({
        action: "checkpoint",
        eventId: "event-route",
        encounterId: encounter.id,
        revision: 0,
        inputs: [],
        clientTick: 0,
      }),
    );
    expect(expired.status).toBe(410);
    await expect(expired.json()).resolves.toMatchObject({ error: "expired" });
    expect(
      parseDangerousFishingState(memory.states.get("route-user")).bossAttempt,
    ).toBeNull();

    const retry = await startRealtimeBoss();
    expect(retry.id).not.toBe(encounter.id);
  });

  it("만료 유예가 지난 realtime 거대어 finish는 무기여 결과를 멱등 기록하고 시도를 비운다", async () => {
    memory.events.set("event-route", event());
    memory.contributions.set("event-route:route-user", {
      eventId: "event-route",
      userId: "route-user",
      totalContribution: 90,
      successfulAttempts: 1,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    const encounter = await startRealtimeBoss();
    vi.mocked(Date.now).mockReturnValue(encounter.expiresAt + 30_001);

    const first = await finishRealtimeBoss(
      encounter,
      { inputs: [], clientTick: 0 },
      "boss-expired-idempotent",
    );
    const firstJson = await first.json();
    expect(first.status).toBe(410);
    expect(firstJson).toMatchObject({ ok: false, error: "expired" });
    const recovered = parseDangerousFishingState(
      memory.states.get("route-user"),
    );
    expect(recovered.bossAttempt).toBeNull();
    expect(recovered.realtimeCompletions).toContainEqual(
      expect.objectContaining({
        requestId: "boss-expired-idempotent",
        encounterId: encounter.id,
      }),
    );
    expect(memory.contributions.get("event-route:route-user")).toMatchObject({
      totalContribution: 90,
      successfulAttempts: 1,
    });

    const retry = await finishRealtimeBoss(
      encounter,
      { inputs: [], clientTick: 0 },
      "boss-expired-idempotent",
    );
    expect(retry.status).toBe(410);
    await expect(retry.json()).resolves.toEqual(firstJson);
  });

  it("새 realtime 거대어 시작은 만료 유예가 지난 같은 이벤트 시도를 같은 트랜잭션에서 교체한다", async () => {
    memory.events.set("event-route", event());
    const expired = await startRealtimeBoss();
    vi.mocked(Date.now).mockReturnValue(expired.expiresAt + 30_001);

    const next = await startRealtimeBoss();
    expect(next.id).not.toBe(expired.id);
    expect(
      parseDangerousFishingState(memory.states.get("route-user")).bossAttempt,
    ).toMatchObject({
      eventId: "event-route",
      encounter: { simulationVersion: 2, id: next.id },
    });
  });

  it("legacy 거대어 시작도 만료 유예가 지난 realtime 시도를 해소하고 같은 이벤트 재시도를 연다", async () => {
    memory.events.set("event-route", event());
    const expired = await startRealtimeBoss();
    vi.mocked(Date.now).mockReturnValue(expired.expiresAt + 30_001);

    const response = await POST(request({
      action: "start",
      eventId: "event-route",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      encounter: { targetKind: "boss" },
    });
    expect(parseDangerousFishingState(memory.states.get("route-user")).bossAttempt)
      .toMatchObject({ encounter: { simulationVersion: 1 } });
  });

  it("동시 마지막 인양은 한 사용자만 처치·기여하고 패자는 기존 기여를 보존한다", async () => {
    memory.events.set("event-route", event({
      stamina: DANGEROUS_BOSSES.tidal_colossus.attemptStamina,
    }));
    memory.states.set("angler-a", emptyDangerousFishingState());
    memory.states.set("angler-b", emptyDangerousFishingState());
    memory.contributions.set("event-route:angler-b", {
      eventId: "event-route",
      userId: "angler-b",
      totalContribution: 120,
      successfulAttempts: 1,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    const firstEncounter = await startRealtimeBoss("angler-a");
    const secondEncounter = await startRealtimeBoss("angler-b");
    const firstTranscript = responsiveTranscript(firstEncounter);
    const secondTranscript = responsiveTranscript(secondEncounter);
    vi.mocked(Date.now).mockReturnValue(
      NOW.getTime() + Math.max(firstTranscript.clientTick, secondTranscript.clientTick) * 50,
    );

    auth.userId = "angler-a";
    const firstRequest = finishRealtimeBoss(
      firstEncounter,
      firstTranscript,
      "boss-last-a",
    );
    auth.userId = "angler-b";
    const secondRequest = finishRealtimeBoss(
      secondEncounter,
      secondTranscript,
      "boss-last-b",
    );
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: "already_defeated" });
    expect(memory.events.get("event-route")).toMatchObject({
      stamina: 0,
      status: "defeated",
      lastHaulUserId: "angler-a",
    });
    expect(memory.contributions.get("event-route:angler-a")).toMatchObject({
      totalContribution: 240,
      successfulAttempts: 1,
    });
    expect(memory.contributions.get("event-route:angler-b")).toMatchObject({
      totalContribution: 120,
      successfulAttempts: 1,
    });
  });

  it("GET 만료 처리와 realtime finish는 모두 사용자 잠금 뒤 이벤트를 잠근다", async () => {
    memory.events.set("event-route", event());
    const encounter = await startRealtimeBoss();
    const transcript = responsiveTranscript(encounter);

    memory.events.set("event-route", event({
      expiresAt: new Date(NOW.getTime() - 1),
    }));
    memory.lockTrace.length = 0;
    const status = await GET();
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({
      event: { id: "event-route", status: "expired" },
    });
    expect(memory.lockTrace.slice(0, 4)).toEqual([
      "user",
      "save:dangerous-fishing.v1",
      "event:expire",
      "event:read",
    ]);

    memory.events.set("event-route", event());
    memory.lockTrace.length = 0;
    vi.mocked(Date.now).mockReturnValue(
      encounter.startedAt + transcript.clientTick * 50,
    );
    const finish = await finishRealtimeBoss(
      encounter,
      transcript,
      "boss-lock-order",
    );
    expect(finish.status).toBe(200);
    expect(memory.lockTrace.indexOf("user")).toBe(0);
    expect(memory.lockTrace.indexOf("event:for-update")).toBeGreaterThan(
      memory.lockTrace.indexOf("user"),
    );
  });
});
