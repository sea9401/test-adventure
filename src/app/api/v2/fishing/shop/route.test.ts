import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FISHING_ABYSSAL_SUMMON_BAIT_ITEM_ID,
  FISHING_SHOP_STATE_KEY,
} from "@/adventure/v2/fishingShop";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";

const coopMocks = vi.hoisted(() => ({
  summon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "angler-1"),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(),
  readSave: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/v2Coop", () => ({
  summonFishingCoopBoss: coopMocks.summon,
}));

import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { POST } from "./route";

const saves = new Map<string, unknown>();

function request() {
  return new Request("http://localhost/api/v2/fishing/shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId: FISHING_ABYSSAL_SUMMON_BAIT_ITEM_ID }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T12:00:00+09:00"));
  vi.clearAllMocks();
  saves.clear();
  saves.set(FISHING_WALLET_KEY, { coins: 20_000 });
  saves.set(FISHING_SHOP_STATE_KEY, {});
  vi.mocked(lockSaveForUpdate).mockImplementation(
    async (_tx, _userId, key, fallback) => saves.get(key) ?? fallback,
  );
  vi.mocked(upsertSave).mockImplementation(
    async (_tx, _userId, key, value) => {
      saves.set(key, value);
    },
  );
  coopMocks.summon.mockResolvedValue({
    ok: true,
    boss: {
      sessionId: "abyss-1",
      kind: "abyssal_tyrant",
      name: "심연어룡",
      expiresAt: Date.now() + 60_000,
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("낚시 코인 심연어룡 소환 미끼", () => {
  it("구매 즉시 심연어룡을 소환하고 3,000 코인과 일일 횟수를 차감한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      itemId: FISHING_ABYSSAL_SUMMON_BAIT_ITEM_ID,
      coins: 17_000,
      abyssalBait: {
        boughtToday: 1,
        dailyLimit: 1,
        remainingToday: 0,
      },
      coopBoss: { sessionId: "abyss-1", name: "심연어룡" },
    });
    expect(saves.get(FISHING_WALLET_KEY)).toMatchObject({ coins: 17_000 });
  });

  it("본인의 심연어룡이 활성 상태면 코인과 일일 횟수를 차감하지 않는다", async () => {
    coopMocks.summon.mockResolvedValue({
      ok: false,
      error: "already_active",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "boss_already_active",
      coins: 20_000,
      abyssalBait: { boughtToday: 0, remainingToday: 1 },
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("한 번 구매한 날에는 재소환을 시도하거나 코인을 더 차감하지 않는다", async () => {
    expect((await POST(request())).status).toBe(200);
    vi.mocked(upsertSave).mockClear();

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "limit_reached",
      coins: 17_000,
      abyssalBait: { boughtToday: 1, remainingToday: 0 },
    });
    expect(coopMocks.summon).toHaveBeenCalledTimes(1);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("서버 동시 소환 상한에 걸리면 코인과 일일 횟수를 차감하지 않는다", async () => {
    coopMocks.summon.mockResolvedValue({
      ok: false,
      error: "capacity_reached",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "boss_capacity_reached",
      coins: 20_000,
      abyssalBait: { boughtToday: 0, remainingToday: 1 },
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("코인이 부족하면 심연어룡 소환을 시도하지 않는다", async () => {
    saves.set(FISHING_WALLET_KEY, { coins: 2_999 });

    const response = await POST(request());

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: "insufficient_coins",
      coins: 2_999,
    });
    expect(coopMocks.summon).not.toHaveBeenCalled();
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("다음 KST 일자에는 구매 한도가 초기화된다", async () => {
    expect((await POST(request())).status).toBe(200);
    vi.setSystemTime(new Date("2026-09-06T12:00:00+09:00"));
    coopMocks.summon.mockResolvedValue({
      ok: true,
      boss: {
        sessionId: "abyss-2",
        kind: "abyssal_tyrant",
        name: "심연어룡",
        expiresAt: Date.now() + 60_000,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      coins: 14_000,
      abyssalBait: { boughtToday: 1, remainingToday: 0 },
      coopBoss: { sessionId: "abyss-2" },
    });
  });
});
