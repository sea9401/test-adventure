import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  userId: "liberator-1" as string | null,
  saves: new Map<string, unknown>(),
  receipts: new Map<string, {
    userId: string;
    requestId: string;
    iid: string;
    expectedRevision: number;
    response: unknown;
  }>(),
  transactionTail: Promise.resolve(),
  writes: 0,
  failReceiptInsert: false,
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return {
    ...actual,
    get V2_EQUIPMENT_LIBERATION() {
      return mocks.featureEnabled;
    },
  };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => {
      const run = mocks.transactionTail.then(async () => {
        const saveSnapshot = structuredClone([...mocks.saves]);
        const receiptSnapshot = structuredClone([...mocks.receipts]);
        const writesBefore = mocks.writes;
        try {
          return await callback({});
        } catch (error) {
          mocks.saves = new Map(saveSnapshot);
          mocks.receipts = new Map(receiptSnapshot);
          mocks.writes = writesBefore;
          throw error;
        }
      });
      mocks.transactionTail = run.then(() => undefined, () => undefined);
      return run;
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.saves.has(key) ? structuredClone(mocks.saves.get(key)) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.saves.set(key, structuredClone(value));
    mocks.writes += 1;
  }),
}));
vi.mock("@/lib/server/equipmentLiberationReceipts", () => ({
  readEquipmentLiberationReceipt: vi.fn(
    async (_tx, userId: string, requestId: string) =>
      mocks.receipts.get(`${userId}:${requestId}`) ?? null,
  ),
  insertEquipmentLiberationReceipt: vi.fn(async (_tx, receipt) => {
    if (mocks.failReceiptInsert) throw new Error("receipt insert failed");
    mocks.receipts.set(`${receipt.userId}:${receipt.requestId}`, structuredClone(receipt));
  }),
}));

import { POST } from "./route";
import { lockSaveForUpdate } from "@/lib/server/savesKv";
import { POST as liberate } from "../liberate/route";

const REQUEST_A = "00000000-0000-4000-8000-000000000001";
const REQUEST_B = "00000000-0000-4000-8000-000000000002";

function request(body: unknown): Request {
  return new Request("http://localhost/api/v2/me/equipment/enchantment-transfer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seed(gold = 100_000_000): void {
  mocks.saves.clear();
  mocks.receipts.clear();
  mocks.saves.set("character.v2", { level: 100, gold, bankedGold: 0 });
  mocks.saves.set("equipment.v2", {
    owned: [
      { iid: "source", id: "v2_storm_breaker_greatsword", bound: true, liberation: { rank: 2, lineCount: 2, revision: 8, options: [
        { id: "physical_attack_flat", level: 8 }, { id: "magic_attack_flat", level: 6 },
      ] } },
      { iid: "target", id: "v2_storm_breaker_greatsword" },
      { iid: "other", id: "v2_storm_breaker_greatsword" },
    ],
    equipped: { weapon: "source" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureEnabled = true;
  mocks.userId = "liberator-1";
  mocks.transactionTail = Promise.resolve();
  mocks.writes = 0;
  mocks.failReceiptInsert = false;
  seed();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

const intent = { sourceIid: "source", targetIid: "target", expectedSourceRevision: 8, expectedTargetRevision: 0, requestId: REQUEST_A };

describe("POST enchantment-transfer", () => {
  it("기능 비활성·미인증·잘못된 입력은 저장 전에 거절한다", async () => {
    mocks.featureEnabled = false;
    expect((await POST(request(intent))).status).toBe(404);
    mocks.featureEnabled = true;
    mocks.userId = null;
    expect((await POST(request(intent))).status).toBe(401);
    mocks.userId = "liberator-1";
    for (const body of [null, [], {}, { ...intent, expectedTargetRevision: null }, { ...intent, expectedSourceRevision: "8" }, { ...intent, targetIid: 5 }, { ...intent, requestId: "bad" }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
  });

  it("같은 UUID는 골드와 양쪽 장비를 한 번만 갱신한다", async () => {
    const first = await POST(request(intent));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, replayed: false, spentGold: 45_000_000,
      source: { iid: "source", bound: true, liberationRevision: 9 },
      target: { iid: "target", bound: true, liberation: { rank: 2, lineCount: 2, revision: 1 } },
      gold: 55_000_000,
    });
    const replay = await POST(request(intent));
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
    expect(mocks.writes).toBe(2);
    expect(mocks.saves.get("character.v2")).toMatchObject({ gold: 55_000_000 });
  });

  it("UUID의 대상·변경 번호·작업 종류가 달라지면 거절한다", async () => {
    await POST(request(intent));
    for (const changed of [{ ...intent, targetIid: "other" }, { ...intent, expectedTargetRevision: 1 }, { ...intent, expectedSourceRevision: 9 }]) {
      const response = await POST(request(changed));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "request_id_conflict" });
    }
    const differentOperation = await liberate(request({ iid: "source", expectedRevision: 9, requestId: REQUEST_A }));
    expect(await differentOperation.json()).toMatchObject({ error: "request_id_conflict" });
    expect(mocks.writes).toBe(2);
  });

  it("같은 원본의 동시 이전은 하나만 성공한다", async () => {
    const responses = await Promise.all([
      POST(request(intent)),
      POST(request({ ...intent, targetIid: "other", requestId: REQUEST_B })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 409]);
    expect(await responses[1].json()).toMatchObject({ error: "stale_state" });
    expect(mocks.writes).toBe(2);
    expect(mocks.saves.get("character.v2")).toMatchObject({ gold: 55_000_000 });
  });

  it("확인 후 대상 재부여가 발생하면 새로운 옵션을 덮어쓰지 않는다", async () => {
    await liberate(request({ iid: "target", expectedRevision: 0, requestId: REQUEST_B }));
    const before = structuredClone([...mocks.saves]);
    const response = await POST(request(intent));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "stale_state", target: { liberation: { revision: 1 } } });
    expect([...mocks.saves]).toEqual(before);
  });

  it("영수증 저장 실패는 양쪽 장비와 골드를 모두 롤백한다", async () => {
    const before = structuredClone([...mocks.saves]);
    mocks.failReceiptInsert = true;
    await expect(POST(request(intent))).rejects.toThrow("receipt insert failed");
    expect([...mocks.saves]).toEqual(before);
    expect(mocks.receipts.size).toBe(0);
  });
});
