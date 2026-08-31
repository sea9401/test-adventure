// 자동 벌목 start/chop/status route 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

const { store, incrementGuildExplorationProgressForUser, rewardReferralTutorialTasks, recordCodexMasteryGameplayBatch, upsertSaves } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
  store,
  incrementGuildExplorationProgressForUser: vi.fn(async () => null),
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [] as string[],
    completedTaskIds: [] as string[],
  })),
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
  upsertSaves: vi.fn(async (_tx, _uid, entries: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(entries)) store.set(key, value);
  }),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationProgressForUser,
}));
vi.mock("@/lib/server/referrals", () => ({ rewardReferralTutorialTasks }));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const query: Record<string, unknown> = {};
      query.from = () => query;
      query.where = () => query;
      query.for = () => query;
      query.limit = async () => [{ id: "u-test" }];
      return callback({ select: vi.fn(() => query) });
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSavesForUpdate: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fallbacks).map(([key, fallback]) => [
      key,
      store.has(key) ? store.get(key) : fallback,
    ]))
  ),
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_dbOrTx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSaves: vi.fn(async (_dbOrTx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fallbacks).map(([key, fallback]) => [
      key,
      store.has(key) ? store.get(key) : fallback,
    ]))
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
  upsertSaves,
}));

import { POST as START } from "@/app/api/v2/woodcutting/start/route";
import { POST as CHOP } from "@/app/api/v2/woodcutting/chop/route";
import { POST as AUTO } from "@/app/api/v2/woodcutting/auto/route";
import { GET as STATUS } from "@/app/api/v2/woodcutting/status/route";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TIMBER_REWARD,
} from "@/adventure/v2/woodcuttingSession";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";
import { FISHING_SESSION_KEY } from "@/adventure/v2/fishingSession";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";

const NOW = 1_700_000_000_000;
const TIMBER = SETTLEMENT_MATERIAL_ID.timber;
const OAK = WOODCUTTING_MATERIAL_ID.oak;

function chopReq(sessionId: string) {
  return new Request("http://test.local/api/v2/woodcutting/chop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

function startReq(spotId: string) {
  return new Request("http://test.local/api/v2/woodcutting/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spotId }),
  });
}

function charOf() {
  return store.get("character.v2") as { materials?: Record<string, number> };
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  store.clear();
  incrementGuildExplorationProgressForUser.mockClear();
  rewardReferralTutorialTasks.mockClear();
  recordCodexMasteryGameplayBatch.mockClear();
  upsertSaves.mockClear();
  resetUserRateLimitForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("woodcutting routes", () => {
  it("2시간 느긋한 자동 벌목을 선택해 낮은 성공률과 재료 효율을 고정한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);

    const response = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          spotId: "pine_grove",
          planId: "extended",
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.serverNow).toBe(NOW);
    expect(json.autoSession).toMatchObject({
      planId: "extended",
      readyAt: NOW + 2 * 60 * 60_000,
      successRate: 0.72,
      materialEfficiency: 0.6,
      xpEfficiency: 0.7,
    });
    expect(store.get(WOODCUTTING_AUTO_KEY)).toMatchObject({
      session: { planId: "extended" },
    });
  });

  it("다른 자동 생활 작업 중에는 벌목과 자동 벌목을 시작할 수 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: "v2_iron_ore",
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 7_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });

    const manualResponse = await START(startReq("oak_grove"));
    expect(manualResponse.status).toBe(409);
    await expect(manualResponse.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });

    const autoResponse = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({ action: "start", spotId: "oak_grove" }),
      }),
    );
    expect(autoResponse.status).toBe(409);
    await expect(autoResponse.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "mining",
    });
  });

  it("자동 벌목을 중단하면 완료된 진행분을 정산한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 15 * 60_000);
    store.set(WOODCUTTING_AUTO_KEY, {
      session: {
        sessionId: "wood-auto",
        sourceId: "oak",
        sourceName: "참나무",
        materialId: OAK,
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 9_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
      remainders: {
        successes: { oak: 0.25 },
        materials: { [OAK]: 0.5 },
        xp: 0.75,
        mastery: 0.4,
      },
    });
    store.set("character.v2", {
      class: "survivor",
      specChoice: "lumberjack",
      materials: { [OAK]: 3 },
    });
    store.set("proficiency.v2", {
      groups: { survivor: { tier: 1, cumLevel: 900 } },
      jobCumLevel: { lumberjack: 10 },
    });

    const response = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toMatchObject({
      ok: true,
      canceled: true,
      attempts: 100,
      successes: 90,
      materialsGained: 72,
      xpGained: 630,
      masteryGained: 63,
    });
    expect(store.get(WOODCUTTING_AUTO_KEY)).toMatchObject({
      session: null,
      remainders: {
        successes: { oak: 0.25 },
        materials: { [OAK]: 0.5 },
        xp: 0.75,
      },
    });
    const autoState = store.get(WOODCUTTING_AUTO_KEY) as {
      remainders: { mastery: number };
    };
    expect(autoState.remainders.mastery).toBeCloseTo(0.4);
    expect(charOf().materials?.[OAK]).toBe(75);
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 90,
      xp: 630,
      timberEarned: 72,
    });
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(Object.keys(upsertSaves.mock.calls[0]?.[2] ?? {}).sort()).toEqual([
      LIFE_WORKSHOP_SAVE_KEY,
      WOODCUTTING_AUTO_KEY,
      WOODCUTTING_LOG_KEY,
      "character.v2",
      "proficiency.v2",
    ].sort());
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "lumberjack",
        amount: 63,
        source: "job.activity",
      }],
      new Date(NOW + 15 * 60_000),
    );
  });

  it("자동 정산은 구 초과 XP를 한 번 환산하고 버전을 함께 저장한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 15 * 60_000);
    store.set(WOODCUTTING_AUTO_KEY, {
      session: {
        sessionId: "wood-migration",
        sourceId: "oak",
        sourceName: "참나무",
        materialId: OAK,
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 9_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 999_999, xp: 999_999 });
    store.set("character.v2", { materials: {} });

    const response = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.levelCurveMigrated).toBe(true);
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      levelCurveVersion: 2,
      xp: 136_623,
    });
  });

  it("자동 벌목 보조품의 추가 원목은 작업 효율로 감산하지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 15 * 60_000);
    store.set(WOODCUTTING_AUTO_KEY, {
      session: {
        sessionId: "wood-aid-auto",
        planId: "extended",
        sourceId: "pine",
        sourceName: "소나무",
        materialId: TIMBER,
        startedAt: NOW,
        readyAt: NOW + 2 * 60 * 60_000,
        cycleDurationMs: 9_000,
        attempts: 800,
        successRate: 1,
        materialEfficiency: 0.6,
        xpEfficiency: 0.7,
        bonusMaterialRate: 0,
        baseXp: 5,
        aidItemId: "logging_wedge_basic",
        aidBonusMaterialRate: 0.1,
      },
    });
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      crafting: {
        activeAids: {
          woodcutting: {
            itemId: "logging_wedge_basic",
            remainingUses: 600,
            enabled: true,
          },
        },
      },
    });

    const response = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      successes: 100,
      materialsGained: 70,
    });
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toMatchObject({
      crafting: {
        activeAids: {
          woodcutting: { remainingUses: 500 },
        },
      },
    });
  });

  it("수동 낚시 중에는 자동 벌목을 시작할 수 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set(FISHING_SESSION_KEY, {
      castId: "cast-active",
      biteAt: NOW + 3_000,
      expiresAt: NOW + 20_000,
      fishId: "carp",
      size: 42,
    });

    const response = await AUTO(
      new Request("http://test.local/api/v2/woodcutting/auto", {
        method: "POST",
        body: JSON.stringify({ action: "start", spotId: "oak_grove" }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "manual_active",
      activeManualActivity: "fishing",
    });
  });

  it("자동 벌목 중에는 기존 수동 벌목 세션도 정산할 수 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 5_000);
    store.set(WOODCUTTING_AUTO_KEY, {
      session: {
        sessionId: "wood-auto",
        sourceId: "oak",
        sourceName: "참나무",
        materialId: OAK,
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 7_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "manual-cut",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
    });

    const response = await CHOP(chopReq("manual-cut"));
    expect(response.status).toBe(409);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      sessionId: "manual-cut",
    });
  });
  it("start — 체크포인트가 걸리면 관리형 사람 확인을 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    store.set(ACTIVITY_GUARD_KEY, {
      version: 5,
      activities: {
        woodcutting: {
          verificationRequiredAt: NOW,
          completedSinceVerification: 500,
        },
      },
    });
    const response = await START(startReq("pine_grove"));
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "human_verification_required",
      activity: "woodcutting",
      siteKey: "site",
    });
    expect(response.status).toBe(403);
  });

  it("start — 등록되지 않은 숲은 거부한다", async () => {
    const response = await START(startReq("unknown_grove"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "bad_spot" });
  });

  it("start — 자동 벌목 시간과 도끼질 횟수를 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set("character.v2", { materials: { [TIMBER]: 7 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 2, timberEarned: 9 });

    const response = await START(startReq("pine_grove"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.sessionId).toBe("string");
    expect(json.durationMs).toBeGreaterThanOrEqual(6_500);
    expect(json.lifeEnvironment?.environment?.id).toBeTruthy();
    expect(json.chops).toBeGreaterThanOrEqual(5);
    expect(json.failureRate).toBeCloseTo(0.1);
    expect(json.successRate).toBeCloseTo(0.9);
    expect(json.spot.id).toBe("pine_grove");
    expect(json.timber).toBe(7);
    expect(json.log.cuts).toBe(2);
    expect(json.log.xp).toBe(20);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      sessionId: json.sessionId,
      spotId: "pine_grove",
      readyAt: NOW + json.durationMs,
    });
  });

  it("start — 벌목 레벨에 따라 서버 완료 시간을 보수적으로 단축한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set(WOODCUTTING_LOG_KEY, { cuts: 100, xp: 4_000 });

    const response = await START(startReq("birch_grove"));
    const json = await response.json();

    expect(json.baseDurationMs).toBe(8_000);
    expect(json.durationMs).toBe(7_800);
    expect(json.failureRate).toBeCloseTo(0.17);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      readyAt: NOW + 7_800,
    });
  });

  it("start — 장착한 나무꾼 패시브를 세션 실패율에 고정한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const equipped = [
      "v2c_lumberjack_woodreading",
      "v2c_foresttechnician_axecare",
      "v2c_masterlumberjack_recoverycut",
      "v2c_forestmaster_efficientwork",
      "v2c_legendarylumberjack_bountifulcut",
    ];
    store.set("skills.v2", { learned: equipped, equipped });

    const response = await START(startReq("cypress_grove"));
    const json = await response.json();

    expect(json.failureReductionPct).toBe(20);
    expect(json.durationReductionPct).toBe(18);
    expect(json.failureRecoveryPct).toBe(20);
    expect(json.bonusLogChancePct).toBe(30);
    expect(json.durationMs).toBe(14_800);
    expect(json.failureRate).toBeCloseTo(0.56);
    expect(json.successRate).toBeCloseTo(0.44);
    expect(
      (store.get(WOODCUTTING_SESSION_KEY) as { failureRate: number }).failureRate,
    ).toBeCloseTo(0.56);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      failureRecoveryRate: 0.2,
      bonusLogRate: 0.3,
    });
  });

  it("chop — 완료 시각 전에는 보상과 세션을 그대로 둔다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 1_000);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-early",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const response = await CHOP(chopReq("cut-early"));
    const json = await response.json();

    expect(json).toMatchObject({ ok: true, success: false, reason: "not_ready" });
    expect(json.retryAfterMs).toBe(3_500);
    expect(charOf().materials?.[TIMBER]).toBe(3);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({ sessionId: "cut-early" });
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "woodcutting",
      ),
    ).toMatchObject({ earlyAttempts: 1, riskScore: 0 });

    await CHOP(chopReq("cut-early"));
    await CHOP(chopReq("cut-early"));
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "woodcutting",
      ),
    ).toMatchObject({ earlyAttempts: 0, strongSignals: 1, riskScore: 18 });
  });

  it("chop — 완료 뒤 선택한 수종의 원목과 기록을 지급한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-done",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const response = await CHOP(chopReq("cut-done"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.tree.name).toBe("참나무");
    expect(json.materialId).toBe(OAK);
    expect(json.materialName).toBe("참나무 원목");
    expect(json.materialGained).toBe(WOODCUTTING_TIMBER_REWARD);
    expect(json.xpGained).toBe(10);
    expect(charOf().materials?.[OAK]).toBe(1);
    expect(charOf().materials?.[TIMBER]).toBe(3);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toEqual({});
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 1,
      xp: 10,
      timberEarned: 1,
      trees: { oak: 1 },
    });
    expect(incrementGuildExplorationProgressForUser).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      "woodcuttingSuccesses",
      1,
      new Date(NOW + 4_600),
    );
  });

  it("chop — 벌목 레벨 5에 도달하면 홍보 생활 단계를 확인한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-life-5",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
    });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 63, xp: 630 });
    store.set("character.v2", { materials: {} });

    const response = await CHOP(chopReq("cut-life-5"));

    expect(response.status).toBe(200);
    expect(rewardReferralTutorialTasks).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      "새 모험가",
      ["life_level_5"],
    );
  });

  it("chop — 성공 시 매우 낮은 확률로 농장 씨앗 1개를 지급한다", async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.99).mockReturnValueOnce(0);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-with-seed",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.22,
      bonusLogRate: 0,
    });
    store.set("character.v2", { materials: {} });
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(NOW),
      seeds: { herb: 2 },
    });

    const json = await (await CHOP(chopReq("cut-with-seed"))).json();

    expect(json).toMatchObject({
      success: true,
      seedDrop: { cropId: "wheat", seedName: "밀 씨앗", quantity: 1 },
    });
    expect(parseFarmState(store.get(FARM_SAVE_KEY)).seeds).toEqual({
      wheat: 1,
      herb: 2,
    });
  });

  it("chop — 일일 활동량만 많으면 원목을 전량 지급하고 대기를 추가하지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-volume-limited",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.1,
    });
    store.set("character.v2", { materials: {} });
    store.set(ACTIVITY_GUARD_KEY, {
      version: 2,
      activities: {},
      risk: {
        score: 0,
        updatedAt: NOW,
        dailyKey: kstDailyKey(new Date(NOW + 4_600)),
        dailyCompleted: 1_499,
        dailyVolumeStage: 2,
      },
    });

    const json = await (await CHOP(chopReq("cut-volume-limited"))).json();

    expect(json).toMatchObject({
      success: true,
      materialGained: 1,
      xpGained: 10,
      nextActionAt: null,
    });
    expect(charOf().materials).toEqual({ [OAK]: 1 });
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 1,
      xp: 10,
      timberEarned: 1,
    });
    expect(incrementGuildExplorationProgressForUser).toHaveBeenCalledTimes(1);

    expect((await START(startReq("pine_grove"))).status).toBe(200);
  });

  it("chop — 실패 판정이면 원목·XP·주간 의뢰 진척을 지급하지 않는다", async () => {
    vi.mocked(Math.random).mockReturnValue(0.1);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-failed",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.22,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 4, xp: 40, timberEarned: 4 });

    const response = await CHOP(chopReq("cut-failed"));
    const json = await response.json();

    expect(json).toMatchObject({
      ok: true,
      success: false,
      reason: "failed",
      failureRate: 0.22,
    });
    expect(charOf().materials).toEqual({ [TIMBER]: 3 });
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 4,
      xp: 40,
      timberEarned: 4,
    });
    expect(store.get(WOODCUTTING_SESSION_KEY)).toEqual({});
    expect(incrementGuildExplorationProgressForUser).not.toHaveBeenCalled();
    expect(store.has(FARM_SAVE_KEY)).toBe(false);
  });

  it("chop — 나무꾼은 성공 시 생존자·직업 숙련도를 함께 얻는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "lumberjack-done",
      spotId: "pine_grove",
      treeId: "pine",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.05,
    });
    store.set("character.v2", {
      class: "survivor",
      specChoice: "lumberjack",
      materials: {},
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cumLevel: 900, runs: 0 } },
      jobCumLevel: { lumberjack: 12 },
    });

    const response = await CHOP(chopReq("lumberjack-done"));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      jobId: "lumberjack",
      jobName: "나무꾼",
      masteryGained: 1,
      masteryAfter: 13,
    });
    expect(store.get("proficiency.v2")).toMatchObject({
      groups: { survivor: { cumLevel: 901 } },
      jobCumLevel: { lumberjack: 13 },
    });
    expect(upsertSaves).toHaveBeenCalledTimes(1);
    expect(Object.keys(upsertSaves.mock.calls[0]?.[2] ?? {}).sort()).toEqual([
      ACTIVITY_GUARD_KEY,
      LIFE_WORKSHOP_SAVE_KEY,
      WOODCUTTING_LOG_KEY,
      WOODCUTTING_SESSION_KEY,
      "character.v2",
      "proficiency.v2",
    ].sort());
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-test",
      [{
        category: "job",
        entryId: "lumberjack",
        amount: 1,
        source: "job.activity",
      }],
      new Date(NOW + 4_600),
    );
  });

  it("chop — 벌목 명인 패시브가 실패를 20% 확률로 성공 처리한다", async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.1);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "recovered-cut",
      spotId: "oak_grove",
      treeId: "oak",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.22,
      failureRecoveryRate: 0.2,
      bonusLogRate: 0,
    });
    store.set("character.v2", { materials: {} });

    const json = await (await CHOP(chopReq("recovered-cut"))).json();

    expect(json).toMatchObject({ success: true, recovered: true, materialGained: 1 });
  });

  it("chop — 전설의 나무꾼 패시브가 성공 시 30% 확률로 원목을 하나 더 준다", async () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.99).mockReturnValueOnce(0.1);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_600);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "legendary-cut",
      spotId: "cypress_grove",
      treeId: "cypress",
      readyAt: NOW + 4_500,
      expiresAt: NOW + 34_500,
      failureRate: 0.4,
      failureRecoveryRate: 0,
      bonusLogRate: 0.3,
    });
    store.set("character.v2", { materials: {} });

    const json = await (await CHOP(chopReq("legendary-cut"))).json();

    expect(json).toMatchObject({
      success: true,
      materialGained: 2,
      bonusMaterialGained: 1,
      recovered: false,
    });
  });

  it("status — 통나무와 누적 기록을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set("character.v2", { materials: { [TIMBER]: 11 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 3, timberEarned: 12 });
    store.set("skills.v2", {
      learned: ["v2c_foresttechnician_axecare"],
      equipped: ["v2c_foresttechnician_axecare"],
    });
    const response = await STATUS();
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.serverNow).toBe(NOW);
    expect(json.timber).toBe(11);
    expect(json.log.cuts).toBe(3);
    expect(json.log.xp).toBe(30);
    expect(json.log.timberEarned).toBe(12);
    expect(json.durationReductionPct).toBe(8);
  });
});
