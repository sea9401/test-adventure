import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
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
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_dbOrTx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST as START } from "@/app/api/v2/mining/start/route";
import { POST as STRIKE } from "@/app/api/v2/mining/strike/route";
import { POST as AUTO } from "@/app/api/v2/mining/auto/route";
import { GET as STATUS } from "@/app/api/v2/mining/status/route";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  MINING_SESSION_KEY,
} from "@/adventure/v2/miningSession";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  parseActivityGuardState,
} from "@/lib/server/activityGuard";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  MINING_AUTO_KEY,
  WOODCUTTING_AUTO_KEY,
} from "@/adventure/v2/autoGathering";

const NOW = 1_700_000_000_000;

function request(path: string, body: unknown) {
  return new Request(`http://test.local/api/v2/mining/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  store.clear();
  resetUserRateLimitForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("mining routes", () => {
  it("자동 벌목 중에는 수동 채광을 시작할 수 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set(WOODCUTTING_AUTO_KEY, {
      session: {
        sessionId: "wood-auto",
        sourceId: "oak",
        sourceName: "참나무",
        materialId: "v2_oak_log",
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 7_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });

    const response = await START(request("start", { spotId: "iron_quarry" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "auto_active",
      activeAutoActivity: "woodcutting",
    });
  });

  it("자동 채광을 중단하면 완료된 진행분을 정산한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 15 * 60_000);
    const iron = MINING_MATERIAL_ID.iron;
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: iron,
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 9_000,
        attempts: 200,
        successRate: 1,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    store.set("character.v2", { materials: { [iron]: 2 } });

    const response = await AUTO(request("auto", { action: "cancel" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      canceled: true,
      attempts: 100,
      successes: 100,
      materialsGained: 80,
      xpGained: 700,
    });
    expect(store.get(MINING_AUTO_KEY)).toMatchObject({ session: null });
    expect(store.get("character.v2")).toMatchObject({
      materials: { [iron]: 82 },
    });
    expect(store.get(MINING_LOG_KEY)).toMatchObject({
      successes: 100,
      xp: 700,
      oreEarned: 80,
    });
  });

  it("자동 채광 중에는 기존 수동 채광 세션도 정산할 수 없다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 5_000);
    store.set(MINING_AUTO_KEY, {
      session: {
        sessionId: "mining-auto",
        sourceId: "iron",
        sourceName: "철 광맥",
        materialId: MINING_MATERIAL_ID.iron,
        startedAt: NOW,
        readyAt: NOW + 30 * 60_000,
        cycleDurationMs: 7_000,
        attempts: 200,
        successRate: 0.9,
        bonusMaterialRate: 0,
        baseXp: 10,
      },
    });
    store.set(MINING_SESSION_KEY, {
      sessionId: "manual-mine",
      spotId: "iron_quarry",
      nodeId: "iron",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
    });

    const response = await STRIKE(
      request("strike", { sessionId: "manual-mine" }),
    );
    expect(response.status).toBe(409);
    expect(store.get(MINING_SESSION_KEY)).toMatchObject({
      sessionId: "manual-mine",
    });
  });
  it("start — 등록되지 않은 채광지는 거부한다", async () => {
    const response = await START(request("start", { spotId: "unknown" }));
    expect(response.status).toBe(400);
  });

  it("start — 채광 세션과 현재 성공률을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set("character.v2", {
      materials: { [MINING_MATERIAL_ID.iron]: 7 },
    });
    const response = await START(request("start", { spotId: "iron_quarry" }));
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      durationMs: 7_000,
      strikes: 5,
      failureRate: 0.1,
      successRate: 0.9,
      node: { id: "iron" },
    });
    expect(store.get(MINING_SESSION_KEY)).toMatchObject({
      sessionId: json.sessionId,
      spotId: "iron_quarry",
      nodeId: "iron",
      readyAt: NOW + 7_000,
    });
  });

  it("start — 장착한 광부 패시브를 채광 세션에 고정한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const equipped = [
      "v2c_miner_veinreading",
      "v2c_miningtechnician_toolcare",
      "v2c_masterminer_recoverystroke",
      "v2c_minemaster_efficientmining",
      "v2c_legendaryminer_richvein",
    ];
    store.set("skills.v2", { learned: equipped, equipped });

    const response = await START(
      request("start", { spotId: "adamantite_chasm" }),
    );
    const json = await response.json();

    expect(json).toMatchObject({
      failureReductionPct: 20,
      durationReductionPct: 18,
      failureRecoveryPct: 20,
      bonusOreChancePct: 30,
      durationMs: 14_800,
    });
    expect(json.failureRate).toBeCloseTo(0.56);
    expect(store.get(MINING_SESSION_KEY)).toMatchObject({
      failureRecoveryRate: 0.2,
      bonusOreRate: 0.3,
    });
  });

  it("start — 채광 사람 확인 체크포인트를 적용한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    store.set(ACTIVITY_GUARD_KEY, {
      version: 1,
      activities: { mining: { verificationRequiredAt: NOW } },
    });
    const response = await START(request("start", { spotId: "iron_quarry" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "human_verification_required",
      activity: "mining",
    });
  });

  it("strike — 완료 전에는 보상 없이 대기 시간을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 1_000);
    store.set(MINING_SESSION_KEY, {
      sessionId: "mine-early",
      spotId: "iron_quarry",
      nodeId: "iron",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.1,
    });
    const json = await (
      await STRIKE(request("strike", { sessionId: "mine-early" }))
    ).json();
    expect(json).toMatchObject({
      ok: true,
      success: false,
      reason: "not_ready",
      retryAfterMs: 3_000,
    });
    expect(store.get(MINING_SESSION_KEY)).toMatchObject({
      sessionId: "mine-early",
    });
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "mining",
      ),
    ).toMatchObject({ earlyAttempts: 1, riskScore: 0 });

    await STRIKE(request("strike", { sessionId: "mine-early" }));
    await STRIKE(request("strike", { sessionId: "mine-early" }));
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "mining",
      ),
    ).toMatchObject({ earlyAttempts: 0, strongSignals: 1, riskScore: 18 });
  });

  it("strike — 성공 시 주 광석과 XP만 지급한다", async () => {
    vi.mocked(Math.random)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0.01);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_100);
    store.set(MINING_SESSION_KEY, {
      sessionId: "mine-gold",
      spotId: "gold_mine",
      nodeId: "gold",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.5,
    });
    store.set("character.v2", { materials: {} });
    const json = await (
      await STRIKE(request("strike", { sessionId: "mine-gold" }))
    ).json();
    expect(json).toMatchObject({
      success: true,
      materialId: MINING_MATERIAL_ID.gold,
      materialName: "금광석",
      materialGained: 1,
      xpGained: 10,
    });
    expect(json.byproducts).toEqual([]);
    expect(store.get("character.v2")).toMatchObject({
      materials: {
        [MINING_MATERIAL_ID.gold]: 1,
      },
    });
    expect(store.get(MINING_LOG_KEY)).toMatchObject({
      successes: 1,
      xp: 10,
      oreEarned: 1,
      byproductsEarned: 0,
      nodes: { gold: 1 },
    });
  });

  it("strike — 일일 활동량만 많으면 광석을 전량 지급하고 대기를 추가하지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_100);
    store.set(MINING_SESSION_KEY, {
      sessionId: "mine-volume-limited",
      spotId: "iron_quarry",
      nodeId: "iron",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.1,
    });
    store.set("character.v2", { materials: {} });
    store.set(ACTIVITY_GUARD_KEY, {
      version: 2,
      activities: {},
      risk: {
        score: 0,
        updatedAt: NOW,
        dailyKey: kstDailyKey(new Date(NOW + 4_100)),
        dailyCompleted: 1_499,
        dailyVolumeStage: 2,
      },
    });

    const json = await (
      await STRIKE(request("strike", { sessionId: "mine-volume-limited" }))
    ).json();

    expect(json).toMatchObject({
      success: true,
      materialGained: 1,
      xpGained: 5,
      nextActionAt: null,
    });
    expect(json.byproducts).toEqual([]);
    expect(store.get("character.v2")).toMatchObject({
      materials: { [MINING_MATERIAL_ID.iron]: 1 },
    });
    expect(store.get(MINING_LOG_KEY)).toMatchObject({
      successes: 1,
      xp: 5,
      oreEarned: 1,
    });

    expect(
      (await START(request("start", { spotId: "iron_quarry" }))).status,
    ).toBe(200);
  });

  it("strike — 실패하면 광석과 XP를 지급하지 않는다", async () => {
    vi.mocked(Math.random).mockReturnValue(0.1);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_100);
    store.set(MINING_SESSION_KEY, {
      sessionId: "mine-failed",
      spotId: "gold_mine",
      nodeId: "gold",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.5,
    });
    store.set("character.v2", { materials: {} });
    const json = await (
      await STRIKE(request("strike", { sessionId: "mine-failed" }))
    ).json();
    expect(json).toMatchObject({
      success: false,
      reason: "failed",
      failureRate: 0.5,
    });
    expect(store.get("character.v2")).toMatchObject({ materials: {} });
    expect(store.has(MINING_LOG_KEY)).toBe(false);
  });

  it("strike — 광부는 성공 시 생존자·직업 숙련도를 함께 얻는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_100);
    store.set(MINING_SESSION_KEY, {
      sessionId: "miner-done",
      spotId: "iron_quarry",
      nodeId: "iron",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.05,
    });
    store.set("character.v2", {
      class: "survivor",
      specChoice: "miner",
      materials: {},
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { survivor: { tier: 1, cumLevel: 900, runs: 0 } },
      jobCumLevel: { miner: 12 },
    });

    const json = await (
      await STRIKE(request("strike", { sessionId: "miner-done" }))
    ).json();

    expect(json).toMatchObject({
      success: true,
      jobId: "miner",
      jobName: "광부",
      masteryGained: 1,
      masteryAfter: 13,
    });
    expect(store.get("proficiency.v2")).toMatchObject({
      groups: { survivor: { cumLevel: 901 } },
      jobCumLevel: { miner: 13 },
    });
  });

  it("strike — 채광 명인은 실패를 구제하고 전설의 광부는 광석을 하나 더 얻는다", async () => {
    vi.mocked(Math.random)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.99);
    vi.spyOn(Date, "now").mockReturnValue(NOW + 4_100);
    store.set(MINING_SESSION_KEY, {
      sessionId: "recovered-mine",
      spotId: "gold_mine",
      nodeId: "gold",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.5,
      failureRecoveryRate: 0.2,
      bonusOreRate: 0,
    });
    store.set("character.v2", { materials: {} });

    const recovered = await (
      await STRIKE(request("strike", { sessionId: "recovered-mine" }))
    ).json();
    expect(recovered).toMatchObject({
      success: true,
      recovered: true,
      materialGained: 1,
    });

    vi.mocked(Math.random)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.1)
      .mockReturnValue(0.99);
    store.set(MINING_SESSION_KEY, {
      sessionId: "legendary-mine",
      spotId: "gold_mine",
      nodeId: "gold",
      readyAt: NOW + 4_000,
      expiresAt: NOW + 34_000,
      failureRate: 0.5,
      failureRecoveryRate: 0,
      bonusOreRate: 0.3,
    });

    const bonus = await (
      await STRIKE(request("strike", { sessionId: "legendary-mine" }))
    ).json();
    expect(bonus).toMatchObject({
      success: true,
      recovered: false,
      materialGained: 2,
      bonusMaterialGained: 1,
    });
  });

  it("status — 채광 재료와 누적 기록을 반환한다", async () => {
    store.set("character.v2", {
      materials: { [MINING_MATERIAL_ID.silver]: 4 },
    });
    store.set(MINING_LOG_KEY, { successes: 3, oreEarned: 3 });
    store.set("skills.v2", {
      learned: ["v2c_miningtechnician_toolcare"],
      equipped: ["v2c_miningtechnician_toolcare"],
    });
    const json = await (await STATUS()).json();
    expect(json.materials[MINING_MATERIAL_ID.silver]).toBe(4);
    expect(json.log).toMatchObject({ successes: 3, xp: 30, oreEarned: 3 });
    expect(json.durationReductionPct).toBe(8);
  });
});
