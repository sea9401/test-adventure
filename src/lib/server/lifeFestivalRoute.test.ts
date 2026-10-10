import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(),
  addLifeFestivalScore: vi.fn(async () => undefined),
  readLifeFestivalRanking: vi.fn(
    async (_executor: unknown, _weekId: string, _viewerId: string, _now: Date) => ({
      top: [],
      me: null,
    }),
  ),
  grantTitleIfMissingInTx: vi.fn(async () => true),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-festival"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/lifeActivityLock", () => ({
  lockLifeActivityUserForUpdate: vi.fn(async () => undefined),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/lifeFestival/scores", () => ({
  addLifeFestivalScore: mocks.addLifeFestivalScore,
  readLifeFestivalRanking: mocks.readLifeFestivalRanking,
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: mocks.grantTitleIfMissingInTx,
}));

import { GET, POST } from "@/app/api/v2/life-festival/route";
import { GET as RANKING } from "@/app/api/v2/life-festival/ranking/route";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";
import type { LifeFestivalOrder } from "@/adventure/data/v2/lifeFestival";
import { LIFE_PROCESSED_MATERIAL_ID } from "@/adventure/v2/lifeWorkshopMaterials";
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import {
  LIFE_FESTIVAL_SAVE_KEY,
  lifeFestivalOrdersForWeek,
} from "@/adventure/v2/lifeFestival";

const SAVE = LIFE_FESTIVAL_SAVE_KEY;
const INGOT = LIFE_PROCESSED_MATERIAL_ID.basicIngot;

function mondays(count: number): string[] {
  const start = Date.parse("2026-01-05T00:00:00.000Z");
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 7 * 86_400_000).toISOString().slice(0, 10),
  );
}

function weekWith(predicate: (order: LifeFestivalOrder) => boolean): {
  now: number;
  weekId: string;
  order: LifeFestivalOrder;
} {
  for (const weekId of mondays(104)) {
    const order = lifeFestivalOrdersForWeek(weekId).find(predicate);
    if (order) {
      return { now: Date.parse(`${weekId}T12:00:00+09:00`), weekId, order };
    }
  }
  throw new Error("no week with matching order");
}

const ingotWeek = weekWith(
  (order) => order.requirement.kind === "processed" && order.requirement.itemId === INGOT,
);

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/life-festival", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function save<T = Record<string, unknown>>(key: string): T {
  return mocks.store.get(key) as T;
}

beforeEach(() => {
  mocks.upsertSave.mockImplementation(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  });
});

afterEach(() => {
  mocks.store.clear();
  mocks.upsertSave.mockReset();
  mocks.addLifeFestivalScore.mockClear();
  mocks.readLifeFestivalRanking.mockClear();
  mocks.grantTitleIfMissingInTx.mockClear();
  vi.restoreAllMocks();
});

describe("GET /api/v2/life-festival", () => {
  it("빈 세이브로 이번 주 테마·주문 6건·상점 10건을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const json = await (await GET()).json();
    expect(json).toMatchObject({ ok: true, weekId: ingotWeek.weekId, tokens: 0, weeklyScore: 0, myRank: null });
    expect(json.theme.id).toBeTruthy();
    expect(json.orders).toHaveLength(6);
    expect(json.shop).toHaveLength(10);
    expect(json.endsAt).toBe(
      new Date(Date.parse(`${ingotWeek.weekId}T00:00:00+09:00`) + 7 * 86_400_000).toISOString(),
    );
  });
});

describe("POST deliver", () => {
  it("가공재를 차감하고 증표와 점수를 쌓는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const quantity = ingotWeek.order.requirement.quantity;
    mocks.store.set("character.v2", { gold: 5, materials: { [INGOT]: quantity * 2 } });

    const response = await post({ action: "deliver", orderId: ingotWeek.order.id, times: 2 });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.gained).toEqual({
      tokens: ingotWeek.order.baseTokens * 2,
      score: ingotWeek.order.baseTokens * 20,
    });
    expect(save<{ gold: number; materials: Record<string, number> }>("character.v2")).toEqual({
      gold: 5,
      materials: {},
    });
    expect(save(SAVE)).toMatchObject({
      weekId: ingotWeek.weekId,
      tokens: ingotWeek.order.baseTokens * 2,
      deliveries: { [ingotWeek.order.id]: 2 },
    });
    expect(mocks.addLifeFestivalScore).toHaveBeenCalledWith(expect.anything(), {
      userId: "u-festival",
      weekId: ingotWeek.weekId,
      score: ingotWeek.order.baseTokens * 20,
      deliveries: 2,
    });
    expect(json.view.orders.find((order: { id: string }) => order.id === ingotWeek.order.id)).toMatchObject({
      delivered: 2,
      held: 0,
    });
  });

  it("연속 납품은 차감된 재고로 다시 검증한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    mocks.store.set("character.v2", { materials: { [INGOT]: ingotWeek.order.requirement.quantity } });

    expect((await post({ action: "deliver", orderId: ingotWeek.order.id, times: 1 })).status).toBe(200);
    mocks.upsertSave.mockClear();
    const second = await post({ action: "deliver", orderId: ingotWeek.order.id, times: 1 });

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ ok: false, error: "not_enough_items" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(save(SAVE)).toMatchObject({ deliveries: { [ingotWeek.order.id]: 1 } });
  });

  it("이번 주 편성에 없는 주문은 거절하고 아무것도 저장하지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const inactive = mondays(104)
      .flatMap((weekId) => lifeFestivalOrdersForWeek(weekId))
      .find(
        (order) =>
          !lifeFestivalOrdersForWeek(ingotWeek.weekId).some((active) => active.id === order.id),
      )!;
    mocks.store.set("character.v2", { materials: { [INGOT]: 100 } });

    const response = await post({ action: "deliver", orderId: inactive.id, times: 1 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "order_not_active" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it.each([0, 21, "2", 1.5])("묶음 수 %s 는 400 invalid_times", async (times) => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const response = await post({ action: "deliver", orderId: ingotWeek.order.id, times });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_times" });
  });

  describe("요리 주문", () => {
    const dishWeek = weekWith(
      (order) =>
        order.requirement.kind === "dish" &&
        order.requirement.tag === "offense" &&
        !order.requirement.minQuality,
    );
    const requirement = dishWeek.order.requirement as { quantity: number; minTier: number };
    const good = COOKING_PUBLIC_RECIPES.find(
      (recipe) => recipe.tier >= requirement.minTier && recipe.effectTags.includes("offense"),
    )!;
    const bad = COOKING_PUBLIC_RECIPES.find((recipe) => !recipe.effectTags.includes("offense"))!;
    const goodId = `food2:${good.id}:normal:o0:s0`;
    const badId = `food2:${bad.id}:normal:o0:s0`;

    it("요건에 맞지 않는 요리가 섞이면 거절한다", async () => {
      vi.spyOn(Date, "now").mockReturnValue(dishWeek.now);
      mocks.store.set("inventory.v2", { cookingFoods: { [goodId]: 10, [badId]: 10 } });

      const response = await post({
        action: "deliver",
        orderId: dishWeek.order.id,
        times: 1,
        foodIds: { [goodId]: requirement.quantity - 1, [badId]: 1 },
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "invalid_food_selection" });
      expect(mocks.upsertSave).not.toHaveBeenCalled();
    });

    it("고른 요리만 차감하고 선택지에 보유 요리를 보여준다", async () => {
      vi.spyOn(Date, "now").mockReturnValue(dishWeek.now);
      mocks.store.set("inventory.v2", { masteryCertificates: 3, cookingFoods: { [goodId]: 10, [badId]: 10 } });

      const view = await (await GET()).json();
      expect(view.dishOptions[dishWeek.order.id]).toEqual([
        expect.objectContaining({ foodId: goodId, count: 10, tier: good.tier, quality: "normal" }),
      ]);

      const response = await post({
        action: "deliver",
        orderId: dishWeek.order.id,
        times: 1,
        foodIds: { [goodId]: requirement.quantity },
      });

      expect(response.status).toBe(200);
      expect(save("inventory.v2")).toEqual({
        masteryCertificates: 3,
        cookingFoods: { [goodId]: 10 - requirement.quantity, [badId]: 10 },
      });
    });
  });
});

describe("POST buy", () => {
  it("미스릴 조각을 사면 증표를 차감하고 재료를 지급한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    mocks.store.set(SAVE, { weekId: ingotWeek.weekId, tokens: 100 });
    mocks.store.set("character.v2", { materials: {} });

    const response = await post({ action: "buy", itemId: "mithril_shard" });

    expect(response.status).toBe(200);
    expect(save(SAVE)).toMatchObject({ tokens: 20, weeklyPurchases: { mithril_shard: 1 } });
    expect(save<{ materials: Record<string, number> }>("character.v2").materials).toEqual({
      [GUILD_WORKSHOP_MATERIAL_ID.mithrilShard]: 1,
    });
  });

  it("칭호 상품은 칭호를 지급하고 1회 상품으로 기록한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    mocks.store.set(SAVE, { weekId: ingotWeek.weekId, tokens: 250 });

    const response = await post({ action: "buy", itemId: "title_regular" });

    expect(response.status).toBe(200);
    expect(mocks.grantTitleIfMissingInTx).toHaveBeenCalledWith(
      expect.anything(),
      "u-festival",
      "life_festival_regular",
      ingotWeek.now,
    );
    expect(save(SAVE)).toMatchObject({ tokens: 50, ownedOnceItemIds: ["title_regular"] });
  });

  it("생활 보조품·사료·숙련 증서·스태미나 포션을 각 보관처에 넣는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    mocks.store.set(SAVE, { weekId: ingotWeek.weekId, tokens: 1_000 });
    for (const itemId of ["fertilizer_bundle", "feed_bundle", "mastery_certificate", "stamina_potion"]) {
      expect((await post({ action: "buy", itemId })).status).toBe(200);
    }
    expect(save<{ crafting: { balances: Record<string, number> } }>("life-workshop.v1").crafting.balances).toMatchObject({
      organic_fertilizer: 3,
    });
    expect(save<{ inventory: Record<string, number> }>("farm.v2").inventory).toMatchObject({ compound_feed: 5 });
    expect(save("inventory.v2")).toMatchObject({ masteryCertificates: 10 });
    expect(mocks.store.get("stamina-potions.v1")).toBeTruthy();
  });

  it("증표 부족·주간 한도는 409이고 세이브를 바꾸지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    mocks.store.set(SAVE, { weekId: ingotWeek.weekId, tokens: 10 });
    const poor = await post({ action: "buy", itemId: "feed_bundle" });
    expect(poor.status).toBe(409);
    expect(await poor.json()).toMatchObject({ error: "not_enough_tokens" });

    mocks.store.set(SAVE, {
      weekId: ingotWeek.weekId,
      tokens: 100,
      weeklyPurchases: { feed_bundle: 5 },
    });
    const limited = await post({ action: "buy", itemId: "feed_bundle" });
    expect(limited.status).toBe(409);
    expect(await limited.json()).toMatchObject({ error: "weekly_limit" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });
});

describe("잠금 순서", () => {
  async function lockedKeys() {
    const { lockSaveForUpdate } = await import("@/lib/server/savesKv");
    return vi.mocked(lockSaveForUpdate).mock.calls.map((call) => call[2]);
  }

  it("납품은 품목 세이브를 잠근 뒤 축제 세이브를 마지막에 잠근다(우편 수령과 같은 순서)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const { lockSaveForUpdate } = await import("@/lib/server/savesKv");
    vi.mocked(lockSaveForUpdate).mockClear();
    mocks.store.set("character.v2", { materials: { [INGOT]: 100 } });

    expect((await post({ action: "deliver", orderId: ingotWeek.order.id, times: 1 })).status).toBe(200);

    expect(await lockedKeys()).toEqual(["character.v2", SAVE]);
  });

  it("구매는 지급 세이브를 잠근 뒤 축제 세이브를 마지막에 잠근다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const { lockSaveForUpdate } = await import("@/lib/server/savesKv");
    vi.mocked(lockSaveForUpdate).mockClear();
    mocks.store.set(SAVE, { weekId: ingotWeek.weekId, tokens: 100 });

    expect((await post({ action: "buy", itemId: "mithril_shard" })).status).toBe(200);

    expect(await lockedKeys()).toEqual(["character.v2", SAVE]);
  });
});

describe("GET /api/v2/life-festival/ranking", () => {
  it("previous 는 지난 주, 기본값은 이번 주를 조회한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(ingotWeek.now);
    const previous = new Date(Date.parse(`${ingotWeek.weekId}T00:00:00Z`) - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await RANKING(new Request("http://test.local/api/v2/life-festival/ranking?week=previous"));
    await RANKING(new Request("http://test.local/api/v2/life-festival/ranking"));

    expect(mocks.readLifeFestivalRanking.mock.calls.map((call) => call[1])).toEqual([
      previous,
      ingotWeek.weekId,
    ]);
  });

  it("알 수 없는 주 값은 400 invalid_week", async () => {
    const response = await RANKING(new Request("http://test.local/api/v2/life-festival/ranking?week=all"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_week" });
  });
});
