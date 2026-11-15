import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
  user: "u-deep" as string | null,
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => mocks.user) }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: mocks.recordEconomyEventSoon }));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_db: object, _userId: string, key: string, fallback: unknown) => mocks.saves.get(key) ?? fallback),
  lockSaveForUpdate: vi.fn(async (_tx: object, _userId: string, key: string, fallback: unknown) => mocks.saves.get(key) ?? fallback),
  upsertSave: vi.fn(async (_tx: object, _userId: string, key: string, value: unknown) => {
    mocks.saves.set(key, value);
  }),
}));

import { DEEP_SHOP_ENTRIES, DEEP_SHOP_SAVE_KEY, parseDeepShopState } from "@/adventure/v2/deepShop";
import { kstWeekMondayKey } from "@/lib/kst";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v2/deep-shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const character = () => mocks.saves.get("character.v2") as { gold: number; bankedGold: number; materials: Record<string, number> };
const shop = () => parseDeepShopState(mocks.saves.get(DEEP_SHOP_SAVE_KEY));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = "u-deep";
  mocks.saves.clear();
  mocks.saves.set("character.v2", { gold: 20_000_000, bankedGold: 0, materials: { v2_boss_summon_scroll: 3 } });
  mocks.saves.set(DEEP_SHOP_SAVE_KEY, { tokens: 1_000, weekKey: kstWeekMondayKey(), purchased: {} });
});

describe("GET /api/v2/deep-shop", () => {
  it("로그인하지 않으면 거절한다", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ itemId: "refined_gem", quantity: 1 })).status).toBe(401);
  });

  it("보유 증표와 품목별 남은 주간 한도를 돌려준다", async () => {
    mocks.saves.set(DEEP_SHOP_SAVE_KEY, { tokens: 77, weekKey: kstWeekMondayKey(), purchased: { flawless_gem: 2 } });

    const json = await (await GET()).json();

    expect(json).toMatchObject({ ok: true, tokens: 77 });
    expect(json.entries).toHaveLength(DEEP_SHOP_ENTRIES.length);
    expect(json.entries[0]).toMatchObject({
      itemId: "flawless_gem",
      name: "완벽한 보석",
      count: 1,
      tokenCost: 400,
      goldCost: 5_000_000,
      weeklyLimit: 2,
      remaining: 0,
    });
    expect(json.entries[1]).toMatchObject({ itemId: "refined_gem", remaining: 5 });
  });
});

describe("POST /api/v2/deep-shop", () => {
  it("증표와 골드를 내고 재료를 받는다", async () => {
    const response = await post({ itemId: "boss_summon_scroll", quantity: 2 });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, tokens: 880, gold: 19_000_000, bankedGold: 0 });
    expect(json.gained).toEqual({ v2_boss_summon_scroll: 20 });
    expect(json.entries.find((entry: { itemId: string }) => entry.itemId === "boss_summon_scroll").remaining).toBe(3);
    expect(character()).toMatchObject({ gold: 19_000_000, materials: { v2_boss_summon_scroll: 23 } });
    expect(shop()).toMatchObject({ tokens: 880, purchased: { boss_summon_scroll: 2 } });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-deep",
        eventType: "sink.deep_shop.purchase",
        goldDelta: -1_000_000,
        itemId: "v2_boss_summon_scroll",
        quantity: 20,
      }),
    );
  });

  it.each([
    ["weekly_limit", { itemId: "flawless_gem", quantity: 3 }, 409],
    ["insufficient_tokens", { itemId: "flawless_gem", quantity: 2 }, 409],
    ["unknown_item", { itemId: "reforge_stone", quantity: 1 }, 400],
    ["invalid_quantity", { itemId: "refined_gem", quantity: 0 }, 400],
  ])("%s 이면 거절하고 아무것도 바꾸지 않는다", async (error, body, status) => {
    if (error === "insufficient_tokens") {
      mocks.saves.set(DEEP_SHOP_SAVE_KEY, { tokens: 799, weekKey: kstWeekMondayKey(), purchased: {} });
    }
    const before = JSON.stringify([...mocks.saves]);

    const response = await post(body);

    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(error);
    expect(JSON.stringify([...mocks.saves])).toBe(before);
    expect(mocks.recordEconomyEventSoon).not.toHaveBeenCalled();
  });

  it("골드가 모자라면 거절한다", async () => {
    mocks.saves.set("character.v2", { gold: 999_999, bankedGold: 0, materials: {} });

    const response = await post({ itemId: "refined_gem", quantity: 1 });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("insufficient_gold");
    expect(shop().tokens).toBe(1_000);
  });

  it("본문이 잘못되면 거절한다", async () => {
    const response = await POST(new Request("http://localhost/api/v2/deep-shop", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });
});
