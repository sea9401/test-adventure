// 자동 벌목 start/chop/status route 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, incrementGuildExplorationProgressForUser } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  incrementGuildExplorationProgressForUser: vi.fn(async () => null),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/guildExplorationWeekly", () => ({
  incrementGuildExplorationProgressForUser,
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) },
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

import { POST as START } from "@/app/api/v2/woodcutting/start/route";
import { POST as CHOP } from "@/app/api/v2/woodcutting/chop/route";
import { GET as STATUS } from "@/app/api/v2/woodcutting/status/route";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  WOODCUTTING_TIMBER_REWARD,
} from "@/adventure/v2/woodcuttingSession";

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
  vi.restoreAllMocks();
});

describe("woodcutting routes", () => {
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
    expect(json.durationMs).toBeGreaterThanOrEqual(7_000);
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
    store.set("character.v2", { materials: { [TIMBER]: 11 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 3, timberEarned: 12 });
    const response = await STATUS();
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.timber).toBe(11);
    expect(json.log.cuts).toBe(3);
    expect(json.log.xp).toBe(30);
    expect(json.log.timberEarned).toBe(12);
  });
});
