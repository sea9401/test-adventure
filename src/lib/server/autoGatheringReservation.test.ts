import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  lockSavesForUpdate: vi.fn(
    async (_tx, _uid, fallbacks: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          store.has(key) ? store.get(key) : fallback,
        ]),
      ),
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSaves: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(fallbacks).map(([key, fallback]) => [
        key,
        store.has(key) ? store.get(key) : fallback,
      ]),
    ),
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/lifeActivityLock", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/server/lifeActivityLock")>();
  return {
    ...actual,
    // 사용자 행 잠금은 DB가 있어야 하므로 건너뛴다.
    lockLifeActivityUserForUpdate: vi.fn(async () => {}),
    lockAutoGatheringStatesForUpdate: vi.fn(async () => {
      const { parseAutoGatheringState, MINING_AUTO_KEY, WOODCUTTING_AUTO_KEY } =
        await import("@/adventure/v2/autoGathering");
      return {
        woodcutting: parseAutoGatheringState(store.get(WOODCUTTING_AUTO_KEY)),
        mining: parseAutoGatheringState(store.get(MINING_AUTO_KEY)),
      };
    }),
  };
});

vi.mock("@/lib/server/activityGuardServer", () => ({
  activityVerificationGateResponse: vi.fn(() => null),
}));

import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
  beginAutoGathering,
  createAutoGatheringSession,
  emptyAutoGatheringState,
  parseAutoGatheringState,
  settleAutoGathering,
} from "@/adventure/v2/autoGathering";
import {
  AUTO_GATHERING_RESERVATION_KEY,
  parseAutoGatheringReservationState,
} from "@/adventure/v2/autoGatheringReservation";
import {
  autoGatheringReservationResponse,
  startReservedAutoGatheringInTx,
} from "./autoGatheringReservation";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

function miningSession(now: number) {
  return createAutoGatheringSession({
    sessionId: "mining-1",
    sourceId: "copper",
    sourceName: "구리 광맥",
    materialId: "v2_copper_ore",
    planId: "extended",
    now,
    cycleDurationMs: 6_000,
    successRate: 0.8,
    baseXp: 6,
    spotId: "copper_gallery",
  });
}

function withSupport(now: number) {
  store.set("character.v2", {
    adventureSupport: { activatedAt: now - DAY, activeUntil: now + DAY },
  });
}

beforeEach(() => {
  store.clear();
});

describe("자동 채집 예약 요청", () => {
  it("지원권이 없으면 예약할 수 없다", async () => {
    const now = Date.now();
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), miningSession(now)));
    const response = await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "pine_grove",
      planId: "extended",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "support_required" });
    expect(store.has(AUTO_GATHERING_RESERVATION_KEY)).toBe(false);
  });

  it("진행 중인 자동 채집이 없으면 예약할 수 없다", async () => {
    withSupport(Date.now());
    const response = await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "pine_grove",
      planId: "standard",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "no_active_session" });
  });

  it("그 활동의 채집지가 아니면 거절한다", async () => {
    withSupport(Date.now());
    const response = await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "copper_gallery",
      planId: "standard",
    });
    expect(response.status).toBe(400);
  });

  it("지원권 이용 중이면 다른 쪽 활동도 예약하고 작업 시간을 굳힌다", async () => {
    const now = Date.now();
    withSupport(now);
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), miningSession(now)));
    const response = await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "pine_grove",
      planId: "extended",
    });
    expect(response.status).toBe(200);
    const saved = parseAutoGatheringReservationState(
      store.get(AUTO_GATHERING_RESERVATION_KEY),
    ).next;
    expect(saved).toMatchObject({
      activity: "woodcutting",
      spotId: "pine_grove",
      planId: "extended",
      sourceId: "pine",
      durationMs: 2 * HOUR,
    });
  });

  it("예약을 취소하면 세이브가 비워진다", async () => {
    const now = Date.now();
    withSupport(now);
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), miningSession(now)));
    await autoGatheringReservationResponse("u", "mining", {
      action: "reserve",
      spotId: "iron_quarry",
      planId: "standard",
    });
    const response = await autoGatheringReservationResponse("u", "mining", {
      action: "unreserve",
    });
    expect(response.status).toBe(200);
    expect(
      parseAutoGatheringReservationState(store.get(AUTO_GATHERING_RESERVATION_KEY)).next,
    ).toBeNull();
  });
});

describe("정산 뒤 예약 작업 이어 시작", () => {
  async function reserveWoodcutting(now: number) {
    withSupport(now);
    const session = miningSession(now);
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), session));
    await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "pine_grove",
      planId: "extended",
    });
    // 예약 요청은 실제 지금 시각으로 기록된다. 작업이 도는 중에 건 예약으로 맞춘다.
    const saved = parseAutoGatheringReservationState(
      store.get(AUTO_GATHERING_RESERVATION_KEY),
    ).next;
    store.set(AUTO_GATHERING_RESERVATION_KEY, {
      next: { ...saved, reservedAt: now + 10 * 60 * 1_000 },
    });
    return session;
  }

  function settle(session: ReturnType<typeof miningSession>) {
    const settlement = settleAutoGathering(
      beginAutoGathering(emptyAutoGatheringState(), session),
    );
    if (!settlement) throw new Error("no settlement");
    return settlement.state;
  }

  it("예약이 없으면 아무것도 시작하지 않는다", async () => {
    const session = miningSession(1_000);
    const result = await startReservedAutoGatheringInTx({} as never, "u", {
      settledActivity: "mining",
      settledSession: session,
      settledState: settle(session),
      otherState: emptyAutoGatheringState(),
      canceled: false,
      now: session.readyAt + HOUR,
    });
    expect(result).toEqual({ chained: null, dropped: false });
  });

  it("보상을 늦게 받아도 앞 작업이 끝난 시각부터 이어서 시작한다", async () => {
    const session = await reserveWoodcutting(Date.now() - 5 * HOUR);
    const now = Date.now();
    const result = await startReservedAutoGatheringInTx({} as never, "u", {
      settledActivity: "mining",
      settledSession: session,
      settledState: settle(session),
      otherState: emptyAutoGatheringState(),
      canceled: false,
      now,
    });
    expect(result.chained?.activity).toBe("woodcutting");
    expect(result.chained?.session.startedAt).toBe(session.readyAt);
    expect(result.chained?.session.readyAt).toBe(session.readyAt + 2 * HOUR);
    expect(parseAutoGatheringState(store.get(WOODCUTTING_AUTO_KEY)).session?.sessionId).toBe(
      result.chained?.session.sessionId,
    );
    expect(
      parseAutoGatheringReservationState(store.get(AUTO_GATHERING_RESERVATION_KEY)).next,
    ).toBeNull();
  });

  it("앞 작업이 끝난 뒤에 건 예약은 예약한 시각부터 시작한다", async () => {
    const session = miningSession(Date.now() - 10 * HOUR);
    withSupport(Date.now());
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), session));
    await autoGatheringReservationResponse("u", "woodcutting", {
      action: "reserve",
      spotId: "pine_grove",
      planId: "standard",
    });
    const reservedAt = parseAutoGatheringReservationState(
      store.get(AUTO_GATHERING_RESERVATION_KEY),
    ).next?.reservedAt;
    const result = await startReservedAutoGatheringInTx({} as never, "u", {
      settledActivity: "mining",
      settledSession: session,
      settledState: settle(session),
      otherState: emptyAutoGatheringState(),
      canceled: false,
      now: Date.now() + 1_000,
    });
    expect(result.chained?.session.startedAt).toBe(reservedAt);
  });

  it("중간 정산으로 중단하면 예약 작업이 그 시각에 시작한다", async () => {
    const started = Date.now();
    const session = await reserveWoodcutting(started);
    const now = started + 30 * 60 * 1_000;
    const result = await startReservedAutoGatheringInTx({} as never, "u", {
      settledActivity: "mining",
      settledSession: session,
      settledState: settle(session),
      otherState: emptyAutoGatheringState(),
      canceled: true,
      now,
    });
    expect(result.chained?.session.startedAt).toBe(now);
  });

  it("같은 활동을 예약했으면 방금 정산한 나머지를 이어 쓴다", async () => {
    const started = Date.now() - 5 * HOUR;
    withSupport(Date.now());
    const session = miningSession(started);
    store.set(MINING_AUTO_KEY, beginAutoGathering(emptyAutoGatheringState(), session));
    await autoGatheringReservationResponse("u", "mining", {
      action: "reserve",
      spotId: "iron_quarry",
      planId: "standard",
    });
    const settledState = {
      session: null,
      remainders: { successes: { copper: 0.5 }, materials: {}, xp: 0.25, mastery: 0 },
    };
    const result = await startReservedAutoGatheringInTx({} as never, "u", {
      settledActivity: "mining",
      settledSession: session,
      settledState,
      otherState: emptyAutoGatheringState(),
      canceled: false,
      now: Date.now(),
    });
    expect(result.chained?.activity).toBe("mining");
    const saved = parseAutoGatheringState(store.get(MINING_AUTO_KEY));
    expect(saved.session?.sourceId).toBe("iron");
    expect(saved.remainders.successes.copper).toBe(0.5);
    expect(saved.remainders.xp).toBe(0.25);
  });
});
