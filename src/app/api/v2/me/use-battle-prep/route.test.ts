import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "prep-user") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => mocks.store.set(key, value)),
}));

import { POST } from "./route";

const NOW = Date.parse("2026-11-13T12:00:00+09:00");
const HOUR = 3_600_000;

function request(itemId: unknown) {
  return new Request("http://localhost/api/v2/me/use-battle-prep", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

describe("전투 준비물 사용", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.store.clear();
  });

  it("1개를 차감하고 해당 칸을 12시간으로 교체한다", async () => {
    mocks.store.set("character.v2", {
      gold: 5,
      materials: { v2_prep_whetstone_3: 2 },
      activeBattlePreps: {
        weapon: { itemId: "v2_prep_whetstone_master", expiresAt: NOW + 20 * HOUR },
        armor: { itemId: "v2_prep_brace_1", expiresAt: NOW + 1_000 },
      },
    });

    const response = await POST(request("v2_prep_whetstone_3"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      itemId: "v2_prep_whetstone_3",
      slot: "weapon",
      expiresAt: NOW + 12 * HOUR,
      owned: 1,
    });
    expect(mocks.store.get("character.v2")).toEqual({
      gold: 5,
      materials: { v2_prep_whetstone_3: 1 },
      activeBattlePreps: {
        weapon: { itemId: "v2_prep_whetstone_3", expiresAt: NOW + 12 * HOUR },
        armor: { itemId: "v2_prep_brace_1", expiresAt: NOW + 1_000 },
      },
    });
  });

  it("명장 등급은 24시간이다", async () => {
    mocks.store.set("character.v2", { materials: { v2_prep_brace_master: 1 } });

    const response = await POST(request("v2_prep_brace_master"));

    expect(await response.json()).toMatchObject({ ok: true, slot: "armor", expiresAt: NOW + 24 * HOUR, owned: 0 });
    expect(mocks.store.get("character.v2")).toEqual({
      materials: {},
      activeBattlePreps: { armor: { itemId: "v2_prep_brace_master", expiresAt: NOW + 24 * HOUR } },
    });
  });

  it("어유를 쓰면 기력 보충 칸만 바뀌고 다른 칸은 유지된다", async () => {
    mocks.store.set("character.v2", {
      materials: { v2_prep_fishoil_3: 2 },
      activeBattlePreps: { weapon: { itemId: "v2_prep_whetstone_2", expiresAt: NOW + 1_000 } },
    });

    const response = await POST(request("v2_prep_fishoil_3"));

    expect(await response.json()).toMatchObject({ ok: true, slot: "vigor", expiresAt: NOW + 12 * HOUR, owned: 1 });
    expect(mocks.store.get("character.v2")).toEqual({
      materials: { v2_prep_fishoil_3: 1 },
      activeBattlePreps: {
        weapon: { itemId: "v2_prep_whetstone_2", expiresAt: NOW + 1_000 },
        vigor: { itemId: "v2_prep_fishoil_3", expiresAt: NOW + 12 * HOUR },
      },
    });
  });

  it("미보유는 409, 모르는 품목은 400이고 세이브를 바꾸지 않는다", async () => {
    const before = { materials: { v2_prep_brace_1: 1 } };
    mocks.store.set("character.v2", before);

    const missing = await POST(request("v2_prep_whetstone_1"));
    expect(missing.status).toBe(409);
    expect(await missing.json()).toEqual({ ok: false, error: "not_owned" });

    const unknown = await POST(request("v2_timber"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ ok: false, error: "bad_item" });
    expect((await POST(request(7))).status).toBe(400);

    expect(mocks.store.get("character.v2")).toEqual(before);
  });

  it("저장할 때 만료된 다른 칸은 정리된다", async () => {
    mocks.store.set("character.v2", {
      materials: { v2_prep_whetstone_1: 1 },
      activeBattlePreps: { armor: { itemId: "v2_prep_brace_3", expiresAt: NOW - 1 } },
    });

    await POST(request("v2_prep_whetstone_1"));

    expect(mocks.store.get("character.v2")).toEqual({
      materials: {},
      activeBattlePreps: { weapon: { itemId: "v2_prep_whetstone_1", expiresAt: NOW + 12 * HOUR } },
    });
  });
});
