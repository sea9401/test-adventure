import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
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
import { GET as STATUS } from "@/app/api/v2/mining/status/route";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import {
  MINING_LOG_KEY,
  MINING_SESSION_KEY,
} from "@/adventure/v2/miningSession";
import { ACTIVITY_GUARD_KEY } from "@/lib/server/activityGuard";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";

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
  });

  it("strike — 성공 시 주 광석·부산물·XP를 지급한다", async () => {
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
    expect(json.byproducts).toHaveLength(3);
    expect(store.get("character.v2")).toMatchObject({
      materials: {
        [MINING_MATERIAL_ID.gold]: 1,
        [MINING_MATERIAL_ID.stone]: 1,
        [MINING_MATERIAL_ID.coal]: 1,
        [MINING_MATERIAL_ID.roughGem]: 1,
      },
    });
    expect(store.get(MINING_LOG_KEY)).toMatchObject({
      successes: 1,
      xp: 10,
      oreEarned: 1,
      byproductsEarned: 3,
      nodes: { gold: 1 },
    });
  });

  it("strike — 일일 과다 생산 구간에서는 성공 기록과 XP를 유지하고 재료만 감쇠한다", async () => {
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
      materialGained: 0,
      xpGained: 5,
      rewardMultiplier: 0.75,
      yieldReduced: true,
    });
    expect(json.byproducts).toEqual([]);
    expect(store.get("character.v2")).toMatchObject({ materials: {} });
    expect(store.get(MINING_LOG_KEY)).toMatchObject({
      successes: 1,
      xp: 5,
      oreEarned: 0,
    });
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

  it("status — 채광 재료와 누적 기록을 반환한다", async () => {
    store.set("character.v2", {
      materials: { [MINING_MATERIAL_ID.silver]: 4 },
    });
    store.set(MINING_LOG_KEY, { successes: 3, oreEarned: 3 });
    const json = await (await STATUS()).json();
    expect(json.materials[MINING_MATERIAL_ID.silver]).toBe(4);
    expect(json.log).toMatchObject({ successes: 3, xp: 30, oreEarned: 3 });
  });
});
