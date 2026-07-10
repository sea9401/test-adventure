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

function chopReq(sessionId: string, spot: string, reactionMs: number) {
  return new Request("http://test.local/api/v2/woodcutting/chop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, spot, reactionMs }),
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
    expect(typeof json.round.readyDelayMs).toBe("number");
    expect(typeof json.round.weakSpot).toBe("string");
    expect(typeof json.tree.name).toBe("string");
    expect(json.timber).toBe(7);
    expect(json.log.cuts).toBe(2);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      sessionId: json.sessionId,
      hits: [],
    });
  });

  it("chop — 마지막 타격 성공이면 세션 소비 + 통나무 지급 + 기록 누적", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW + 200);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-1",
      treeId: "oak",
      round: {
        index: 3,
        weakSpot: "root",
        readyAt: NOW,
        expiresAt: woodcuttingExpiresAtFor(NOW),
      },
      hits: [
        {
          round: 1,
          spot: "center",
          weakSpot: "center",
          reactionMs: 200,
          grade: "perfect",
          score: 3,
          reason: "ok",
        },
        {
          round: 2,
          spot: "left",
          weakSpot: "left",
          reactionMs: 420,
          grade: "good",
          score: 2,
          reason: "ok",
        },
      ],
      combo: 2,
      bestCombo: 2,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const res = await CHOP(chopReq("cut-1", "root", 200));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.complete).toBe(true);
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
      bestCombo: 3,
      trees: { oak: 1 },
    });
  });

  it("chop — 너무 이르면 해당 라운드 실패 후 다음 약점을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW - 100);
    store.set(WOODCUTTING_SESSION_KEY, {
      sessionId: "cut-1",
      treeId: "pine",
      round: {
        index: 1,
        weakSpot: "center",
        readyAt: NOW,
        expiresAt: woodcuttingExpiresAtFor(NOW),
      },
      hits: [],
      combo: 0,
      bestCombo: 0,
    });
    store.set("character.v2", { materials: { [TIMBER]: 3 } });

    const res = await CHOP(chopReq("cut-1", "center", -1));
    const json = await res.json();

    expect(json.complete).toBe(false);
    expect(json.hit.reason).toBe("too_early");
    expect(json.round.index).toBe(2);
    expect(charOf().materials?.[TIMBER]).toBe(3);
    expect(store.get(WOODCUTTING_SESSION_KEY)).toMatchObject({
      hits: [{ reason: "too_early", score: 0 }],
      combo: 0,
    });
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
