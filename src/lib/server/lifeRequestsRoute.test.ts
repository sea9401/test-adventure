import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, grantedTitles } = vi.hoisted(() => ({ store: new Map<string, unknown>(), grantedTitles: [] as string[] }));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-life-requests") }));
vi.mock("@/db", () => ({ db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) } }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback),
  readSave: vi.fn(async (_dbOrTx, _uid, key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => { store.set(key, value); }),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async (_tx, _uid, titleId: string) => {
    grantedTitles.push(titleId);
    return true;
  }),
}));

import { GET, POST } from "@/app/api/v2/life-requests/route";
import { LIFE_REQUESTS_SAVE_KEY, emptyLifeRequestsState } from "@/adventure/v2/lifeRequests";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";

function post(body: unknown) {
  return POST(new Request("http://test.local/api/v2/life-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-06T03:00:00+09:00"));
});

afterEach(() => {
  store.clear();
  grantedTitles.length = 0;
  resetUserRateLimitForTests();
  vi.useRealTimers();
});

describe("life requests route", () => {
  it("returns graded daily choices, a weekly chain, and existing-content links", async () => {
    const response = await GET(new Request("http://test.local/api/v2/life-requests"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.daily).toHaveLength(12);
    expect(json.weekly).toHaveLength(2);
    expect(json.chain).toHaveLength(3);
    expect(json.special).toHaveLength(5);
    expect(json.gradeProgress.currentGrade).toBe("normal");
    expect(json.requesterProgress).toHaveLength(5);
    expect(json.reroll).toMatchObject({ used: false, rerolledLane: null });
    expect(json.daily.every((entry: { itemKind: string }) => entry.itemKind === "material" || entry.itemKind === "crafted")).toBe(true);
    expect(json.linkedSources.map((entry: { id: string }) => entry.id)).toEqual(["farm", "cooking", "fishing"]);
  });

  it("consumes materials, grants gold and activity xp, then blocks duplicate delivery", async () => {
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const request = board.daily.find((entry: { activity: string; grade: string }) => entry.activity === "woodcutting" && entry.grade === "normal");
    store.set("character.v2", { gold: 100, materials: { [request.itemId]: request.quantity + 2 } });

    const response = await post({ requestId: request.id, scope: "daily" });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.result.rewardGold).toBe(request.rewardGold);
    expect(store.get("character.v2")).toMatchObject({ gold: 100 + request.rewardGold, materials: { [request.itemId]: 2 } });
    const log = store.get(request.activity === "woodcutting" ? WOODCUTTING_LOG_KEY : MINING_LOG_KEY) as { xp?: number };
    expect(log.xp).toBe(request.rewardXp);
    expect(store.get(LIFE_REQUESTS_SAVE_KEY)).toMatchObject({ stats: { totalDeliveries: 1, dailyDeliveries: 1 } });
    expect(store.get(LIFE_REQUESTS_SAVE_KEY)).toMatchObject({
      requesterTrust: { [request.requesterId]: 1 },
      records: { byGrade: { normal: 1 }, goldEarned: request.rewardGold },
      history: [{ requestId: request.id }],
    });

    const duplicate = await post({ requestId: request.id, scope: "daily" });
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toMatchObject({ error: "already_completed" });
  });

  it("does not consume or complete an understocked request", async () => {
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const request = board.daily.find((entry: { itemKind: string; grade: string }) => entry.itemKind === "material" && entry.grade === "normal");
    store.set("character.v2", { materials: { [request.itemId]: request.quantity - 1 } });
    const response = await post({ requestId: request.id, scope: "daily" });
    expect(response.status).toBe(409);
    expect(store.has(LIFE_REQUESTS_SAVE_KEY)).toBe(false);
  });

  it("blocks locked grades and enforces chained request order", async () => {
    const initial = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const skilled = initial.daily.find((entry: { grade: string }) => entry.grade === "skilled");
    const lockedGrade = await post({ requestId: skilled.id, scope: "daily" });
    expect(lockedGrade.status).toBe(400);
    expect(await lockedGrade.json()).toMatchObject({ error: "grade_locked" });

    const state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    store.set(LIFE_REQUESTS_SAVE_KEY, { ...state, stats: { ...state.stats, totalDeliveries: 10 } });
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const second = board.chain[1];
    const lockedChain = await post({ requestId: second.id, scope: "chain" });
    expect(lockedChain.status).toBe(400);
    expect(await lockedChain.json()).toMatchObject({ error: "chain_locked" });

    const first = board.chain[0];
    store.set("character.v2", { materials: { [first.itemId]: first.quantity } });
    const completed = await post({ requestId: first.id, scope: "chain" });
    expect(completed.status).toBe(200);
    expect(store.get(LIFE_REQUESTS_SAVE_KEY)).toMatchObject({ chain: { completedIds: [first.id] }, stats: { chainDeliveries: 1 } });
  });

  it("rerolls one unfinished daily lane and blocks a second reroll", async () => {
    const before = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const previous = before.reroll.lanes.find((entry: { lane: string }) => entry.lane === "woodcutting").title;
    const response = await post({ action: "reroll", lane: "woodcutting" });
    const after = await response.json();
    expect(response.status).toBe(200);
    expect(after.reroll).toMatchObject({ used: true, rerolledLane: "woodcutting" });
    expect(after.reroll.lanes.find((entry: { lane: string }) => entry.lane === "woodcutting").title).not.toBe(previous);

    const duplicate = await post({ action: "reroll", lane: "mining" });
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toMatchObject({ error: "reroll_used" });
  });

  it("does not reroll a lane that already has a completed delivery", async () => {
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const request = board.daily.find((entry: { lane: string; grade: string }) => entry.lane === "woodcutting" && entry.grade === "normal");
    store.set("character.v2", { materials: { [request.itemId]: request.quantity } });
    expect((await post({ requestId: request.id, scope: "daily" })).status).toBe(200);
    const response = await post({ action: "reroll", lane: "woodcutting" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "reroll_completed" });
  });

  it("offers a second reroll candidate at requester trust 5", async () => {
    const state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    store.set(LIFE_REQUESTS_SAVE_KEY, { ...state, requesterTrust: { ...state.requesterTrust, carpenter: 5 } });
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const woodcutting = board.reroll.lanes.find((entry: { lane: string }) => entry.lane === "woodcutting");
    expect(woodcutting.candidates).toHaveLength(2);
    const response = await post({ action: "reroll", lane: "woodcutting", offset: 2 });
    expect(response.status).toBe(200);
    expect((await response.json()).reroll).toMatchObject({ rerolledLane: "woodcutting", rerolledOffset: 2 });
  });

  it("unlocks requester weekly work at trust 15 and shares the normal weekly limit", async () => {
    const state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    store.set(LIFE_REQUESTS_SAVE_KEY, { ...state, stats: { ...state.stats, totalDeliveries: 15 }, requesterTrust: { ...state.requesterTrust, carpenter: 15 } });
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const special = board.special.find((entry: { requesterId: string }) => entry.requesterId === "carpenter");
    expect(special.requesterUnlocked).toBe(true);
    store.set("character.v2", { materials: { [special.itemId]: special.quantity } });
    expect((await post({ requestId: special.id, scope: "weekly" })).status).toBe(200);
    const regular = board.weekly[0];
    const blocked = await post({ requestId: regular.id, scope: "weekly" });
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toMatchObject({ error: "period_limit" });
  });

  it("grants the requester title once when trust first reaches 35", async () => {
    const state = emptyLifeRequestsState("2026-08-06", "2026-08-03");
    store.set(LIFE_REQUESTS_SAVE_KEY, { ...state, requesterTrust: { ...state.requesterTrust, carpenter: 34 } });
    const board = await (await GET(new Request("http://test.local/api/v2/life-requests"))).json();
    const request = board.daily.find((entry: { requesterId: string; grade: string }) => entry.requesterId === "carpenter" && entry.grade === "normal");
    store.set("character.v2", { materials: { [request.itemId]: request.quantity } });
    const response = await post({ requestId: request.id, scope: "daily" });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(grantedTitles).toEqual(["life_request_jimmy_regular"]);
    expect(json.result.grantedTitleNames).toEqual(["지미의 믿을 만한 손"]);
  });
});
