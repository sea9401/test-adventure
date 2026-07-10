// 벌목 start/chop/status route 통합 테스트 — savesKv/db 경계만 in-memory/mock 처리.

import { afterEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
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

import { POST as START } from "@/app/api/v2/woodcutting/start/route";
import { POST as CHOP } from "@/app/api/v2/woodcutting/chop/route";
import { GET as STATUS } from "@/app/api/v2/woodcutting/status/route";
import { SETTLEMENT_MATERIAL_ID } from "@/adventure/data/v2/settlementMaterials";
import {
  WOODCUTTING_LOG_KEY,
  WOODCUTTING_SESSION_KEY,
  woodcuttingExpiresAtFor,
} from "@/adventure/v2/woodcuttingSession";

const NOW = 1_700_000_000_000;
const TIMBER = SETTLEMENT_MATERIAL_ID.timber;

function chopReq(sessionId: string, reactionMs: number) {
  return new Request("http://test.local/api/v2/woodcutting/chop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, reactionMs }),
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
  it("start — 세션을 만들고 현재 통나무/기록을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    store.set("character.v2", { materials: { [TIMBER]: 7 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 2, timberEarned: 9 });

    const res = await START();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.sessionId).toBe("string");
    expect(typeof json.readyDelayMs).toBe("number");
    expect(json.timber).toBe(7);
    expect(json.log.cuts).toBe(2);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      sessionId: json.sessionId,
    });
  });

  it("chop — 성공하면 세션 소비 + 통나무 지급 + 기록 누적", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 200);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-1",
      readyAt: NOW,
      expiresAt: woodcuttingExpiresAtFor(NOW),
      treeId: "oak",
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const res = await CHOP(chopReq("cut-1", 200));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.success).toBe(true);
    expect(json.tree.name).toBe("참나무");
    expect(json.grade).toBe("perfect");
    expect(json.timberGained).toBe(5);
    expect(charOf().materials?.[TIMBER]).toBe(8);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toEqual({});
    expect(store.get(WOODCUTTING_LOG_KEY)).toMatchObject({
      cuts: 1,
      perfectCuts: 1,
      timberEarned: 5,
      trees: { oak: 1 },
    });
  });

  it("chop — 너무 이르면 실패하고 보상 없이 세션만 소비한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW - 100);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-1",
      readyAt: NOW,
      expiresAt: woodcuttingExpiresAtFor(NOW),
      treeId: "pine",
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const res = await CHOP(chopReq("cut-1", -1));
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(json.reason).toBe("too_early");
    expect(charOf().materials?.[TIMBER]).toBe(3);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toEqual({});
    expect(store.get(WOODCUTTING_LOG_KEY)).toBeUndefined();
  });

  it("status — 통나무와 누적 기록을 반환한다", async () => {
    store.set("character.v2", { materials: { [TIMBER]: 11 } });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 3, timberEarned: 12 });

    const res = await STATUS();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.timber).toBe(11);
    expect(json.log.cuts).toBe(3);
    expect(json.log.timberEarned).toBe(12);
  });
});
