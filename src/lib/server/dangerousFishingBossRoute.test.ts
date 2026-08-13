import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, memory } = vi.hoisted(() => {
  const events = new Map<string, Record<string, unknown>>();
  const contributions = new Map<string, Record<string, unknown>>();
  const states = new Map<string, Record<string, unknown>>();
  const characters = new Map<string, Record<string, unknown>>();
  const wallets = new Map<string, unknown>();
  return {
    auth: { userId: "route-user" as string | null, unlocked: true },
    memory: {
      events,
      contributions,
      states,
      characters,
      wallets,
      reset() {
        events.clear();
        contributions.clear();
        states.clear();
        characters.clear();
        wallets.clear();
      },
      async findActive(now: Date) {
        return (
          [...events.values()].find(
            (event) => event.status === "active" && (event.expiresAt as Date) > now,
          ) ?? null
        );
      },
      async findLatest() {
        return [...events.values()].sort(
          (a, b) =>
            (b.spawnedAt as Date).getTime() - (a.spawnedAt as Date).getTime(),
        )[0] ?? null;
      },
      async expireActive(now: Date) {
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
        return events.get(eventId) ?? null;
      },
      async saveEvent(event: Record<string, unknown>) {
        events.set(event.id as string, event);
      },
      async contributionForUpdate(eventId: string, userId: string) {
        return contributions.get(`${eventId}:${userId}`) ?? null;
      },
      async saveContribution(contribution: Record<string, unknown>) {
        contributions.set(
          `${contribution.eventId}:${contribution.userId}`,
          contribution,
        );
      },
      async dangerousStateForUpdate(userId: string) {
        return states.get(userId);
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
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
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
import { emptyDangerousFishingState } from "@/adventure/v2/dangerousFishingState";

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

describe("거대어 Route Handler", () => {
  beforeEach(() => {
    memory.reset();
    auth.userId = "route-user";
    auth.unlocked = true;
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
});
