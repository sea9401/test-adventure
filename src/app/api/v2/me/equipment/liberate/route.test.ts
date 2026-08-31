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
import { EQUIPMENT_LIBERATION_GOLD_COST } from "@/lib/server/equipmentLiberationService";

const REQUEST_A = "00000000-0000-4000-8000-000000000001";
const REQUEST_B = "00000000-0000-4000-8000-000000000002";

function request(body: unknown): Request {
  return new Request("http://localhost/api/v2/me/equipment/liberate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seed(gold = EQUIPMENT_LIBERATION_GOLD_COST * 2): void {
  mocks.saves.clear();
  mocks.receipts.clear();
  mocks.saves.set("character.v2", { level: 100, gold, bankedGold: 0 });
  mocks.saves.set("equipment.v2", {
    owned: [{ iid: "weapon-1", id: "v2_storm_breaker_greatsword" }],
    equipped: { weapon: "weapon-1" },
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

describe("POST /api/v2/me/equipment/liberate", () => {
  it("rejects disabled, unauthorized, and malformed requests before locking saves", async () => {
    mocks.featureEnabled = false;
    expect((await POST(request({}))).status).toBe(404);
    mocks.featureEnabled = true;
    mocks.userId = null;
    expect((await POST(request({}))).status).toBe(401);
    mocks.userId = "liberator-1";
    expect(
      (
        await POST(
          request({ iid: "weapon-1", requestId: "not-a-uuid", expectedRevision: 0 }),
        )
      ).status,
    ).toBe(400);
    expect(lockSaveForUpdate).not.toHaveBeenCalled();
  });

  it("liberates once and replays the stored response for the same UUID", async () => {
    const intent = { iid: "weapon-1", requestId: REQUEST_A, expectedRevision: 0 };
    const first = await POST(request(intent));
    const replay = await POST(request(intent));

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      replayed: false,
      spentGold: EQUIPMENT_LIBERATION_GOLD_COST,
      item: { iid: "weapon-1", bound: true, liberation: { revision: 1 } },
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ ok: true, replayed: true });
    expect(
      (mocks.saves.get("character.v2") as { gold: number }).gold,
    ).toBe(EQUIPMENT_LIBERATION_GOLD_COST);
    expect(mocks.writes).toBe(2);
  });

  it("rejects UUID reuse with another intent and stale revisions without payment", async () => {
    await POST(
      request({ iid: "weapon-1", requestId: REQUEST_A, expectedRevision: 0 }),
    );
    const afterFirst = (mocks.saves.get("character.v2") as { gold: number }).gold;

    const conflict = await POST(
      request({ iid: "weapon-1", requestId: REQUEST_A, expectedRevision: 1 }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: "request_id_conflict",
    });

    const stale = await POST(
      request({ iid: "weapon-1", requestId: REQUEST_B, expectedRevision: 0 }),
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: "stale_state",
      item: { liberation: { revision: 1 } },
    });
    expect((mocks.saves.get("character.v2") as { gold: number }).gold).toBe(
      afterFirst,
    );
  });

  it("rolls back gold and equipment if receipt persistence fails", async () => {
    const before = structuredClone([...mocks.saves]);
    mocks.failReceiptInsert = true;

    await expect(
      POST(
        request({ iid: "weapon-1", requestId: REQUEST_A, expectedRevision: 0 }),
      ),
    ).rejects.toThrow("receipt insert failed");
    expect([...mocks.saves]).toEqual(before);
    expect(mocks.receipts.size).toBe(0);
  });

  it("serializes concurrent requests so each successful request charges once", async () => {
    const responses = await Promise.all([
      POST(request({ iid: "weapon-1", requestId: REQUEST_A, expectedRevision: 0 })),
      POST(request({ iid: "weapon-1", requestId: REQUEST_B, expectedRevision: 1 })),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect((mocks.saves.get("character.v2") as { gold: number }).gold).toBe(0);
    const equipment = mocks.saves.get("equipment.v2") as {
      owned: Array<{ liberation?: { revision: number } }>;
    };
    expect(equipment.owned[0].liberation?.revision).toBe(2);
    expect(mocks.receipts.size).toBe(2);
  });
});
