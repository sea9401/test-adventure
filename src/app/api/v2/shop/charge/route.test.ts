import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  originalCoreLoopEnv: process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2,
  saves: new Map<string, unknown>(),
}));

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = "true";
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-treatment-charge"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));

import { POST } from "./route";

afterAll(() => {
  if (mocks.originalCoreLoopEnv === undefined) {
    delete process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2;
  } else {
    process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = mocks.originalCoreLoopEnv;
  }
});

function request(kind: "hp" | "mp", amount: number) {
  return new Request("http://localhost/api/v2/shop/charge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, amount }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("inventory.v2", { hpCharges: 10, mpCharges: 20 });
});

describe("POST /api/v2/shop/charge", () => {
  it("지갑이 충분하면 지갑만 차감한다", async () => {
    mocks.saves.set("character.v2", { gold: 100, bankedGold: 500 });

    const response = await POST(request("hp", 30));
    const json = (await response.json()) as {
      gold: number;
      bankedGold: number;
      hpCharges: number;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ gold: 70, bankedGold: 500, hpCharges: 40 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 70,
      bankedGold: 500,
    });
  });

  it("지갑이 부족하면 지갑을 먼저 쓰고 부족분만 은행에서 차감한다", async () => {
    mocks.saves.set("character.v2", { gold: 20, bankedGold: 500 });

    const response = await POST(request("mp", 30));
    const json = (await response.json()) as {
      gold: number;
      bankedGold: number;
      mpCharges: number;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ gold: 0, bankedGold: 490, mpCharges: 50 });
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 0,
      bankedGold: 490,
    });
  });

  it("지갑과 은행 합계가 부족하면 잔액과 충전약을 모두 보존한다", async () => {
    const character = { gold: 20, bankedGold: 5 };
    const inventory = { hpCharges: 10, mpCharges: 20 };
    mocks.saves.set("character.v2", character);
    mocks.saves.set("inventory.v2", inventory);

    const response = await POST(request("hp", 30));
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(json.error).toBe("not_enough_gold");
    expect(mocks.saves.get("character.v2")).toEqual(character);
    expect(mocks.saves.get("inventory.v2")).toEqual(inventory);
  });
});
