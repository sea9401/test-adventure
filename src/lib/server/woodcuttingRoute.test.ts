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
    expect(json.failureRate).toBeCloseTo(0.05);
    expect(json.successRate).toBeCloseTo(0.95);
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
    expect(json.failureRate).toBeCloseTo(0.085);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      readyAt: NOW + 7_800,
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
