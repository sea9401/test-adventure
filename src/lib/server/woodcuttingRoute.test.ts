// 벌목 start/chop/status route 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리.

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
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
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
} from "@/adventure/v2/woodcuttingSession";

const NOW = 1_700_000_000_000;
const TIMBER = SETTLEMENT_MATERIAL_ID.timber;

function chopReq(sessionId: string, selectedLane: number, backCut: string) {
  return new Request("http://test.local/api/v2/woodcutting/chop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, selectedLane, backCut }),
  });
}

function charOf() {
  return store.get("character.v2") as { materials?: Record<string, number> };
}

afterEach(() => {
  store.clear();
  vi.restoreAllMocks();
});

describe("woodcutting routes", () => {
  it("start — 방향 설계 세션과 현재 통나무/기록을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set("character.v2", { materials: { [TIMBER]: 7 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 2, timberEarned: 9 });

    const response = await START();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.sessionId).toBe("string");
    expect([-1, 0, 1]).toContain(json.challenge.wind);
    expect([-2, -1, 0, 1, 2]).toContain(json.challenge.safeLane);
    expect(["low", "level", "high"]).toContain(json.challenge.idealBackCut);
    expect(json.timber).toBe(7);
    expect(json.log.cuts).toBe(2);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      sessionId: json.sessionId,
      challenge: json.challenge,
    });
  });

  it("chop — 바람과 결을 정확히 읽으면 세션 소비 + 통나무 지급 + 기록 누적", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 200);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-1",
      treeId: "oak",
      challenge: { wind: 1, safeLane: 1, idealBackCut: "high" },
      expiresAt: NOW + 90_000,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const response = await CHOP(chopReq("cut-1", 0, "high"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.judgment).toMatchObject({ landingLane: 1, score: 9, grade: "perfect" });
    expect(json.timberGained).toBe(6);
    expect(charOf().materials?.[TIMBER]).toBe(9);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toEqual({});
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 1,
      perfectCuts: 1,
      timberEarned: 6,
      trees: { oak: 1 },
    });
  });

  it("chop — 위험 방향으로 쓰러뜨리면 재료를 지급하지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 200);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-2",
      treeId: "pine",
      challenge: { wind: -1, safeLane: -1, idealBackCut: "level" },
      expiresAt: NOW + 90_000,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const response = await CHOP(chopReq("cut-2", 2, "level"));
    const json = await response.json();

    expect(json.success).toBe(false);
    expect(json.reason).toBe("unsafe_fall");
    expect(json.judgment.landingLane).toBe(1);
    expect(charOf().materials?.[TIMBER]).toBe(3);
    expect(store.get(WOODCUTTING_LOG_KEY)).toBeUndefined();
  });

  it("status — 통나무와 누적 기록을 반환한다", async () => {
    store.set("character.v2", { materials: { [TIMBER]: 11 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 3, timberEarned: 12 });
    const response = await STATUS();
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.timber).toBe(11);
    expect(json.log.cuts).toBe(3);
    expect(json.log.timberEarned).toBe(12);
  });
});
