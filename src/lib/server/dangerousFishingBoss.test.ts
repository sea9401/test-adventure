import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DANGEROUS_BOSSES,
} from "@/adventure/data/v2/dangerousFishing";
import { emptyDangerousFishingState } from "@/adventure/v2/dangerousFishingState";
import type { DangerousFishingState } from "@/adventure/v2/dangerousFishingState";
import {
  isDangerousRealtimeEncounter,
  type DangerousFishingAction,
} from "@/adventure/v2/dangerousFishingEncounter";
import type { DangerousFishingHeritage } from "@/adventure/v2/dangerousFishingHeritage";
import {
  activeDangerousFishingBoss,
  applyBossActionInTx,
  claimBossRewardInTx,
  dangerousBossReward,
  maybeSpawnDangerousFishingBoss,
  startBossAttemptInTx,
  type DangerousFishingBossContributionRecord,
  type DangerousFishingBossEventRecord,
  type DangerousFishingBossStore,
} from "./dangerousFishingBoss";

const NOW = new Date("2026-08-13T00:00:00.000Z");

class MemoryBossStore implements DangerousFishingBossStore {
  events = new Map<string, DangerousFishingBossEventRecord>();
  contributions = new Map<string, DangerousFishingBossContributionRecord>();
  states = new Map<string, DangerousFishingState>();
  characters = new Map<string, Record<string, unknown>>();
  wallets = new Map<string, unknown>();
  heritage: DangerousFishingHeritage = {
    unlocked: true,
    fishingLevel: 15,
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

  contributionKey(eventId: string, userId: string) {
    return `${eventId}:${userId}`;
  }

  async findActive(now: Date) {
    return (
      [...this.events.values()].find(
        (event) => event.status === "active" && event.expiresAt > now,
      ) ?? null
    );
  }

  async findLatest() {
    return (
      [...this.events.values()].sort(
        (a, b) => b.spawnedAt.getTime() - a.spawnedAt.getTime(),
      )[0] ?? null
    );
  }

  async expireActive(now: Date) {
    for (const [id, event] of this.events) {
      if (event.status === "active" && event.expiresAt <= now) {
        this.events.set(id, { ...event, status: "expired" });
      }
    }
  }

  async createEvent(event: DangerousFishingBossEventRecord) {
    if (await this.findActive(event.spawnedAt)) return false;
    this.events.set(event.id, event);
    return true;
  }

  async eventForUpdate(eventId: string) {
    return this.events.get(eventId) ?? null;
  }

  async saveEvent(event: DangerousFishingBossEventRecord) {
    this.events.set(event.id, event);
  }

  async contributionForUpdate(eventId: string, userId: string) {
    return this.contributions.get(this.contributionKey(eventId, userId)) ?? null;
  }

  async saveContribution(contribution: DangerousFishingBossContributionRecord) {
    this.contributions.set(
      this.contributionKey(contribution.eventId, contribution.userId),
      contribution,
    );
  }

  async dangerousStateForUpdate(userId: string) {
    return this.states.get(userId) ?? emptyDangerousFishingState();
  }

  async activeAutoActivityForUpdate() {
    return null;
  }

  async saveDangerousState(userId: string, state: DangerousFishingState) {
    this.states.set(userId, state);
  }

  async heritageForUpdate() {
    return this.heritage;
  }

  async characterForUpdate(userId: string) {
    return this.characters.get(userId) ?? {};
  }

  async saveCharacter(userId: string, character: Record<string, unknown>) {
    this.characters.set(userId, character);
  }

  async walletForUpdate(userId: string) {
    return this.wallets.get(userId) ?? {};
  }

  async saveWallet(userId: string, wallet: unknown) {
    this.wallets.set(userId, wallet);
  }
}

function event(
  patch: Partial<DangerousFishingBossEventRecord> = {},
): DangerousFishingBossEventRecord {
  return {
    id: "event-1",
    bossId: "tidal_colossus",
    discovererId: "discoverer",
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

async function forceSuccessfulAttempt(
  store: MemoryBossStore,
  userId: string,
  eventId = "event-1",
) {
  const started = await startBossAttemptInTx(store, {
    userId,
    eventId,
    now: NOW,
    random: () => 0.5,
    encounterId: `${userId}-attempt`,
  });
  expect(started.ok).toBe(true);
  const state = store.states.get(userId);
  const attempt = state?.bossAttempt;
  if (!attempt || isDangerousRealtimeEncounter(attempt.encounter)) {
    throw new Error("boss attempt fixture missing");
  }
  store.states.set(userId, {
    ...state,
    bossAttempt: {
      ...attempt,
      encounter: {
        ...attempt.encounter,
        behaviorPattern: ["turn"],
        stamina: 5,
        distance: 5,
        nextActionAt: NOW.getTime(),
      },
    },
  });
  return applyBossActionInTx(store, {
    userId,
    eventId,
    encounterId: `${userId}-attempt`,
    revision: attempt.encounter.revision,
    action: "reel" as DangerousFishingAction,
    now: NOW,
  });
}

describe("비동기 거대어 서비스", () => {
  let store: MemoryBossStore;

  beforeEach(() => {
    store = new MemoryBossStore();
    vi.restoreAllMocks();
  });

  it("낚시 레벨 15 미만은 거대어 개인 시도를 시작할 수 없다", async () => {
    store.events.set("event-1", event());
    store.heritage = { ...store.heritage, unlocked: false, fishingLevel: 14 };

    await expect(
      startBossAttemptInTx(store, {
        userId: "low-level",
        eventId: "event-1",
        now: NOW,
      }),
    ).resolves.toEqual({ ok: false, error: "fishing_level_locked" });
  });

  it("거대어 개인 시도에도 기존 낚시 레벨과 낚시꾼 계보 보정을 적용한다", async () => {
    store.events.set("event-1", event());
    store.heritage = {
      ...store.heritage,
      fishingLevel: 50,
      levelAssistPct: 10,
      lineage: { ...store.heritage.lineage, staminaBonusPct: 6 },
    };

    const started = await startBossAttemptInTx(store, {
      userId: "veteran",
      eventId: "event-1",
      now: NOW,
      random: () => 0.5,
      encounterId: "veteran-attempt",
    });

    expect(started).toMatchObject({
      ok: true,
      encounter: { maxTension: 105, reelPowerBonus: 2, staminaDamageBonus: 4 },
    });
  });

  it("위험도 4 이상의 영웅 어획이 6시간 이벤트 하나만 발견한다", async () => {
    const first = await maybeSpawnDangerousFishingBoss(store, {
      userId: "discoverer",
      risk: 4,
      rarity: "epic",
      now: NOW,
      random: () => 0,
      eventId: "event-spawn",
    });
    expect(first).toMatchObject({
      id: "event-spawn",
      discovererId: "discoverer",
      status: "active",
    });
    if (!first) throw new Error("boss event was not created");
    expect(first.expiresAt.getTime() - NOW.getTime()).toBe(6 * 60 * 60_000);

    const duplicate = await maybeSpawnDangerousFishingBoss(store, {
      userId: "other",
      risk: 5,
      rarity: "legendary",
      now: NOW,
      random: () => 0,
      eventId: "event-duplicate",
    });
    expect(duplicate).toBeNull();
    expect(store.events).toHaveLength(1);
  });

  it("낚시꾼 흔적 보너스는 기본 발견 확률에 제한적으로 곱해진다", async () => {
    const base = await maybeSpawnDangerousFishingBoss(store, {
      userId: "angler",
      risk: 4,
      rarity: "epic",
      now: NOW,
      random: () => 0.085,
      eventId: "without-trace",
    });
    expect(base).toBeNull();

    const boosted = await maybeSpawnDangerousFishingBoss(store, {
      userId: "angler",
      risk: 4,
      rarity: "epic",
      now: NOW,
      random: () => 0.085,
      discoveryBonusPct: 10,
      eventId: "with-trace",
    });
    expect(boosted?.id).toBe("with-trace");
  });

  it("저위험·일반 어획과 실패한 발견 굴림은 이벤트를 만들지 않는다", async () => {
    for (const args of [
      { risk: 3, rarity: "epic" as const, random: () => 0 },
      { risk: 5, rarity: "common" as const, random: () => 0 },
      { risk: 5, rarity: "legendary" as const, random: () => 0.99 },
    ]) {
      expect(
        await maybeSpawnDangerousFishingBoss(store, {
          userId: "u",
          now: NOW,
          eventId: "never",
          ...args,
        }),
      ).toBeNull();
    }
  });

  it("만료된 이벤트는 개인 시도 시작을 거부한다", async () => {
    store.events.set(
      "expired",
      event({
        id: "expired",
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    );
    const result = await startBossAttemptInTx(store, {
      userId: "u",
      eventId: "expired",
      now: NOW,
      random: () => 0,
      encounterId: "attempt",
    });
    expect(result).toMatchObject({ ok: false, error: "expired" });
  });

  it("만료된 과거 이벤트의 개인 시도는 새 거대어 시도를 막지 않는다", async () => {
    store.events.set("old-event", event({ id: "old-event" }));
    const previous = await startBossAttemptInTx(store, {
      userId: "angler",
      eventId: "old-event",
      now: NOW,
      random: () => 0.5,
      encounterId: "old-attempt",
    });
    expect(previous.ok).toBe(true);

    store.events.set(
      "old-event",
      event({
        id: "old-event",
        status: "expired",
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    );
    store.events.set(
      "new-event",
      event({
        id: "new-event",
        spawnedAt: new Date(NOW.getTime() + 1_000),
      }),
    );

    const started = await startBossAttemptInTx(store, {
      userId: "angler",
      eventId: "new-event",
      now: new Date(NOW.getTime() + 1_000),
      random: () => 0.5,
      encounterId: "new-attempt",
    });

    expect(started).toMatchObject({
      ok: true,
      event: { id: "new-event" },
      encounter: { id: "new-attempt" },
    });
    expect(store.states.get("angler")?.bossAttempt).toMatchObject({
      eventId: "new-event",
      encounter: { id: "new-attempt" },
    });
  });

  it("성공한 개인 장력 시도가 공용 체력과 개인 기여를 원자적으로 누적한다", async () => {
    store.events.set("event-1", event());
    const result = await forceSuccessfulAttempt(store, "angler");

    expect(result).toMatchObject({
      ok: true,
      event: "caught",
      contribution: DANGEROUS_BOSSES.tidal_colossus.attemptStamina,
      defeated: false,
    });
    expect(store.events.get("event-1")?.stamina).toBe(
      18_000 - DANGEROUS_BOSSES.tidal_colossus.attemptStamina,
    );
    expect(store.contributions.get("event-1:angler")).toMatchObject({
      totalContribution: DANGEROUS_BOSSES.tidal_colossus.attemptStamina,
      successfulAttempts: 1,
    });
    expect(store.states.get("angler")?.bossAttempt).toBeNull();
  });

  it("끊어진 줄은 공용 체력을 깎지 않고 재시도를 허용한다", async () => {
    store.events.set("event-1", event());
    await startBossAttemptInTx(store, {
      userId: "angler",
      eventId: "event-1",
      now: NOW,
      random: () => 0,
      encounterId: "failed-attempt",
    });
    const state = store.states.get("angler");
    const attempt = state?.bossAttempt;
    if (!attempt || isDangerousRealtimeEncounter(attempt.encounter)) {
      throw new Error("boss attempt fixture missing");
    }
    store.states.set("angler", {
      ...state,
      bossAttempt: {
        ...attempt,
        encounter: {
          ...attempt.encounter,
          tension: attempt.encounter.maxTension - 1,
          behaviorPattern: ["charge"],
          nextActionAt: NOW.getTime(),
        },
      },
    });
    const failed = await applyBossActionInTx(store, {
      userId: "angler",
      eventId: "event-1",
      encounterId: "failed-attempt",
      revision: attempt.encounter.revision,
      action: "reel",
      now: NOW,
    });
    expect(failed).toMatchObject({ ok: true, event: "line_broken" });
    expect(store.events.get("event-1")?.stamina).toBe(18_000);
    expect(store.states.get("angler")?.bossAttempt).toBeNull();

    const retry = await startBossAttemptInTx(store, {
      userId: "angler",
      eventId: "event-1",
      now: new Date(NOW.getTime() + 1_000),
      random: () => 0,
      encounterId: "retry-attempt",
    });
    expect(retry.ok).toBe(true);
  });

  it("마지막 두 기여가 겹쳐도 한 번만 처치 상태로 전환한다", async () => {
    store.events.set(
      "event-1",
      event({ stamina: DANGEROUS_BOSSES.tidal_colossus.attemptStamina }),
    );
    const first = await forceSuccessfulAttempt(store, "angler-a");
    expect(first).toMatchObject({ ok: true, defeated: true });
    expect(store.events.get("event-1")).toMatchObject({
      stamina: 0,
      status: "defeated",
      lastHaulUserId: "angler-a",
    });

    const second = await startBossAttemptInTx(store, {
      userId: "angler-b",
      eventId: "event-1",
      now: NOW,
      random: () => 0,
      encounterId: "late",
    });
    expect(second).toMatchObject({ ok: false, error: "already_defeated" });
  });

  it("기여 보상은 1회 성공부터 열리고 고기여 구간에서 완만해진다", () => {
    expect(dangerousBossReward(1, 240, 18_000, false)).toEqual({
      tier: "base",
      fishingCoins: 80,
      materialCount: 1,
      discovererBonus: false,
    });
    expect(dangerousBossReward(3, 1_000, 18_000, false)).toMatchObject({
      tier: "gold",
      fishingCoins: 190,
      materialCount: 3,
    });
    expect(dangerousBossReward(30, 18_000, 18_000, false)).toMatchObject({
      tier: "legend",
      fishingCoins: 220,
      materialCount: 4,
    });
    expect(dangerousBossReward(31, 180_000, 18_000, false)).toEqual(
      dangerousBossReward(30, 18_000, 18_000, false),
    );
  });

  it("발견자 보너스는 가산되고 막타 기록에는 독점 아이템이 없다", () => {
    const reward = dangerousBossReward(1, 240, 18_000, true);
    expect(reward).toEqual({
      tier: "base",
      fishingCoins: 120,
      materialCount: 2,
      discovererBonus: true,
    });
    expect(reward).not.toHaveProperty("lastHaulItem");
  });

  it("처치 보상은 한 번만 재료·낚시 코인·공동 도감에 반영한다", async () => {
    store.events.set(
      "event-1",
      event({
        stamina: 0,
        status: "defeated",
        defeatedAt: NOW,
        lastHaulUserId: "angler",
      }),
    );
    store.contributions.set("event-1:angler", {
      eventId: "event-1",
      userId: "angler",
      totalContribution: 240,
      successfulAttempts: 1,
      firstContributedAt: NOW,
      lastContributedAt: NOW,
      rewardClaimedAt: null,
    });
    store.characters.set("angler", { materials: { v2_iron_ore: 2 } });
    store.wallets.set("angler", { coins: 10 });

    const first = await claimBossRewardInTx(store, {
      userId: "angler",
      eventId: "event-1",
      now: NOW,
    });
    expect(first).toMatchObject({ ok: true, alreadyClaimed: false });
    expect(store.characters.get("angler")).toEqual({
      materials: { v2_iron_ore: 2, danger_boss_tidal_colossus: 1 },
    });
    expect(store.wallets.get("angler")).toMatchObject({ coins: 90 });
    expect(store.states.get("angler")?.bossCodex.tidal_colossus).toMatchObject({
      defeats: 1,
    });

    const duplicate = await claimBossRewardInTx(store, {
      userId: "angler",
      eventId: "event-1",
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(duplicate).toMatchObject({ ok: true, alreadyClaimed: true });
    expect(store.wallets.get("angler")).toMatchObject({ coins: 90 });
  });

  it.each([
    Number.MAX_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_VALUE,
  ])(
    "보스 보상 수령은 기존 지갑 %s에서도 코인을 안전 정수 상한으로 정산한다",
    async (startingCoins) => {
      store.events.set(
        "event-safe-wallet",
        event({
          id: "event-safe-wallet",
          stamina: 0,
          status: "defeated",
          defeatedAt: NOW,
        }),
      );
      store.contributions.set("event-safe-wallet:angler", {
        eventId: "event-safe-wallet",
        userId: "angler",
        totalContribution: 240,
        successfulAttempts: 1,
        firstContributedAt: NOW,
        lastContributedAt: NOW,
        rewardClaimedAt: null,
      });
      store.wallets.set("angler", { coins: startingCoins });

      const result = await claimBossRewardInTx(store, {
        userId: "angler",
        eventId: "event-safe-wallet",
        now: NOW,
      });
      const finalCoins = (store.wallets.get("angler") as { coins: number }).coins;

      expect(result).toMatchObject({ ok: true, alreadyClaimed: false });
      expect(finalCoins).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isSafeInteger(finalCoins)).toBe(true);
    },
  );

  it("활성 조회는 기여 순위 없이 현재 이벤트만 돌려준다", async () => {
    store.events.set("event-1", event());
    const active = await activeDangerousFishingBoss(store, NOW);
    expect(active?.id).toBe("event-1");
    expect(active).not.toHaveProperty("contributors");
    expect(active).not.toHaveProperty("rankings");
  });
});
