import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { store, upsertSave, lifeLevels, grantTitle } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
      store.set(key, value);
    }),
    lifeLevels: { farming: 1, woodcutting: 1, mining: 60, fishing: 1, cooking: 1 },
    grantTitle: vi.fn(async () => true),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-peddler") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/lifeActivityLock", () => ({ lockLifeActivityUserForUpdate: vi.fn(async () => {}) }));
vi.mock("@/lib/server/lifeMajor", () => ({ readLifeLevels: vi.fn(async () => lifeLevels) }));
vi.mock("@/lib/server/grantTitle", () => ({ grantTitleIfMissingInTx: grantTitle }));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave,
}));

import { GET, POST } from "./route";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { PEDDLER_REGULAR_TITLE_ID } from "@/adventure/data/titles";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";
import { PEDDLER_SAVE_KEY, emptyPeddlerState, type PeddlerState } from "@/adventure/v2/peddler";
import { peddlerPreferredItemIds } from "@/adventure/v2/peddlerRules";
import { kstWeekMondayKey } from "@/lib/kst";

const NOW = Date.parse("2026-11-16T03:00:00.000Z");
const WEEK = kstWeekMondayKey(new Date(NOW));
const HOUR = 60 * 60 * 1000;
const IRON = `material:${MINING_MATERIAL_ID.iron}`;

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/peddler", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const peddler = () => store.get(PEDDLER_SAVE_KEY) as PeddlerState;

describe("peddler route", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    lifeLevels.mining = 60;
    store.set("character.v2", { materials: { [MINING_MATERIAL_ID.iron]: 5_000 } });
    store.set("farm.v2", { inventory: { milk: 20 } });
  });
  afterEach(() => {
    store.clear();
    upsertSave.mockClear();
    grantTitle.mockClear();
    vi.restoreAllMocks();
  });

  it("조회는 교역로, 우대 품목, 가진 품목, 교환 품목을 돌려준다", async () => {
    const json = await (await GET()).json();
    expect(json).toMatchObject({ ok: true, unlocked: true, tokens: 0, totalRank: 0, weekId: WEEK });
    expect(json.routes.map((route: { id: string; unlocked: boolean; capacity: number }) => [route.id, route.unlocked, route.capacity])).toEqual([
      ["river", true, 2_000],
      ["ridge", false, 2_000],
      ["harbor", false, 2_000],
    ]);
    expect(json.routes[0].preferred.map((item: { id: string }) => item.id)).toEqual(peddlerPreferredItemIds(WEEK, "river"));
    expect(json.cargo).toEqual([
      { id: IRON, group: "ore", name: "철광석", points: 2, held: 5_000 },
      { id: "farm:milk", group: "ranch", name: "우유", points: 40, held: 20 },
    ]);
    expect(json.shop).toHaveLength(7);
  });

  it("생활 레벨이 모자라면 잠긴 것으로 보여 주고 파견을 거절한다", async () => {
    lifeLevels.mining = 49;
    expect((await (await GET()).json()).unlocked).toBe(false);
    const response = await post({ action: "dispatch", routeId: "river", hours: 8, cargo: { [IRON]: 500 } });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: "life_level_required" });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("파견하면 산물을 빼고 받을 증표를 정해 둔다", async () => {
    const response = await post({ action: "dispatch", routeId: "river", hours: 8, cargo: { [IRON]: 800, "farm:milk": 10 } });
    const json = await response.json();
    expect(response.status).toBe(200);
    // 800×2 + 10×40 = 2,000점 → 8시간 14개. 우대 품목이면 더 받는다.
    expect(json.dispatched).toMatchObject({ routeId: "river", readyAt: NOW + 8 * HOUR });
    expect(json.dispatched.tokens).toBeGreaterThanOrEqual(14);
    expect(store.get("character.v2")).toEqual({ materials: { [MINING_MATERIAL_ID.iron]: 4_200 } });
    expect(store.get("farm.v2")).toEqual({ inventory: { milk: 10 } });
    expect(peddler().routes.river.dispatch).toMatchObject({ hours: 8, points: 2_000 });
    expect(json.view.routes[0].dispatch).toMatchObject({ points: 2_000 });
  });

  it("우대 품목의 점수는 증표를 1.5배로 계산한다", async () => {
    const [preferredId] = peddlerPreferredItemIds(WEEK, "river");
    const [source, itemId] = [preferredId.slice(0, preferredId.indexOf(":")), preferredId.slice(preferredId.indexOf(":") + 1)];
    if (source === "material") store.set("character.v2", { materials: { [itemId]: 100_000 } });
    if (source === "farm") store.set("farm.v2", { inventory: { [itemId]: 100_000 } });
    if (source === "fish") store.set("fishing-stock.v1", { version: 1, items: { [itemId]: 100_000 } });
    const view = await (await GET()).json();
    const item = view.cargo.find((entry: { id: string }) => entry.id === preferredId);
    const quantity = Math.floor(2_000 / item.points);
    const json = await (await post({ action: "dispatch", routeId: "river", hours: 4, cargo: { [preferredId]: quantity } })).json();
    const points = quantity * item.points;
    expect(json.dispatched.tokens).toBe(Math.floor((points * 1.5 * 10) / 2_000));
  });

  it("짐이 모자라거나 적재량을 넘으면 아무것도 빼지 않는다", async () => {
    const over = await post({ action: "dispatch", routeId: "river", hours: 8, cargo: { [IRON]: 1_001 } });
    expect(await over.json()).toMatchObject({ ok: false, error: "over_capacity" });
    const short = await post({ action: "dispatch", routeId: "river", hours: 8, cargo: { "farm:milk": 21 } });
    expect(await short.json()).toMatchObject({ ok: false, error: "not_enough_items" });
    const locked = await post({ action: "dispatch", routeId: "ridge", hours: 8, cargo: { [IRON]: 500 } });
    expect(await locked.json()).toMatchObject({ ok: false, error: "route_locked" });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("잘못된 입력은 400으로 거절한다", async () => {
    for (const body of [
      { action: "dispatch", routeId: "nowhere", hours: 8, cargo: { [IRON]: 500 } },
      { action: "dispatch", routeId: "river", hours: 6, cargo: { [IRON]: 500 } },
      { action: "dispatch", routeId: "river", hours: 8, cargo: { "farm:compound_feed": 5 } },
      { action: "claim", routeId: "nowhere" },
      { action: "buy", itemId: "nope", quantity: 1 },
      { action: "buy", itemId: "master_crop", quantity: 0 },
      { action: "fly" },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it("도착한 수레를 받으면 증표와 교역 점수가 들어온다", async () => {
    await post({ action: "dispatch", routeId: "river", hours: 4, cargo: { [IRON]: 1_000 } });
    const early = await post({ action: "claim", routeId: "river" });
    expect(await early.json()).toMatchObject({ ok: false, error: "not_ready" });

    vi.spyOn(Date, "now").mockReturnValue(NOW + 4 * HOUR);
    const json = await (await post({ action: "claim", routeId: "river" })).json();
    expect(json.claimed).toMatchObject({ routeId: "river", points: 2_000, rankBefore: 0, rankAfter: 0, titleNames: [] });
    expect(peddler().tokens).toBe(json.claimed.tokens);
    expect(peddler().routes.river).toEqual({ standingPoints: 2_000, dispatch: null });
    expect(grantTitle).not.toHaveBeenCalled();
  });

  it("교역 등급 합계가 15에 닿으면 칭호를 준다", async () => {
    const base = emptyPeddlerState(WEEK);
    store.set(PEDDLER_SAVE_KEY, {
      ...base,
      routes: {
        river: { standingPoints: 90_000, dispatch: null },
        ridge: { standingPoints: 90_000, dispatch: null },
        // 4등급에서 5등급으로: 합계 14 → 15
        harbor: {
          standingPoints: 88_000,
          dispatch: { hours: 4, startedAt: NOW - 4 * HOUR, readyAt: NOW, points: 2_000, tokens: 10 },
        },
      },
    });
    const json = await (await post({ action: "claim", routeId: "harbor" })).json();
    expect(json.claimed).toMatchObject({ rankBefore: 4, rankAfter: 5, titleNames: ["단골 행상"] });
    expect(grantTitle).toHaveBeenCalledWith(expect.anything(), "u-peddler", PEDDLER_REGULAR_TITLE_ID, NOW);
  });

  it("증표로 교환하면 품목을 지급하고 주간 구매를 기록한다", async () => {
    store.set(PEDDLER_SAVE_KEY, { ...emptyPeddlerState(WEEK), tokens: 100 });
    const json = await (await post({ action: "buy", itemId: "master_alloy", quantity: 2 })).json();
    expect(json).toMatchObject({ ok: true, bought: { id: "master_alloy", name: "명장 합금", quantity: 2 } });
    expect(peddler().tokens).toBe(40);
    expect((store.get("character.v2") as { materials: Record<string, number> }).materials[LIFE_MAJOR_PRODUCT_ID.mining]).toBe(2);
    expect(json.view.shop.find((item: { id: string }) => item.id === "master_alloy").purchased).toBe(2);

    const feed = await (await post({ action: "buy", itemId: "compound_feed", quantity: 4 })).json();
    expect(feed.bought).toMatchObject({ name: "배합 사료 10개", quantity: 4 });
    expect(store.get("farm.v2")).toEqual({ inventory: { milk: 20, compound_feed: 40 } });
    expect(peddler().tokens).toBe(0);

    const broke = await post({ action: "buy", itemId: "master_crop", quantity: 1 });
    expect(broke.status).toBe(409);
    expect(await broke.json()).toMatchObject({ ok: false, error: "not_enough_tokens" });
  });

  it("지난주 구매 기록은 한도에 넣지 않는다", async () => {
    store.set(PEDDLER_SAVE_KEY, {
      ...emptyPeddlerState("2026-11-02"),
      tokens: 500,
      shop: { weekId: "2026-11-02", purchases: { cut_gem_refined: 1 } },
    });
    const json = await (await post({ action: "buy", itemId: "cut_gem_refined", quantity: 1 })).json();
    expect(json.ok).toBe(true);
    expect(peddler().shop).toEqual({ weekId: WEEK, purchases: { cut_gem_refined: 1 } });
  });
});
