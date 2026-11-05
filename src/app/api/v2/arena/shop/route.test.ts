import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import { PVP_WALLET_KEY } from "@/lib/server/pvp/coins";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "arena-1"),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => true),
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

import { upsertSave } from "@/lib/server/savesKv";
import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/arena/shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set(PVP_WALLET_KEY, { coins: 1_000 });
  mocks.saves.set(STAMINA_POTIONS_KEY, { count: 1, boundCount: 0 });
});

describe("투기장 상점 수량 구매", () => {
  it("요청 한 번으로 회복약 여러 개를 사고 코인을 수량만큼 차감한다", async () => {
    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 5 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      quantity: 5,
      coins: 0,
      staminaPotions: 6,
    });
    expect(mocks.saves.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 6,
      boundCount: 5,
    });
  });

  it("코인이 수량만큼 없으면 일부만 사지 않고 거절한다", async () => {
    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 6 }),
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: "insufficient_coins",
      coins: 1_000,
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("잘못된 수량은 거절한다", async () => {
    const response = await POST(
      request({ itemId: "stamina_potion", quantity: 0 }),
    );

    expect(response.status).toBe(400);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
