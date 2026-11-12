import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-prep") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  upsertSave: mocks.upsertSave.mockImplementation(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  }),
}));

import { GET, POST } from "./route";
import type { BattlePrepCraftRow } from "@/adventure/data/v2/battlePrep";
import { LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { woodcuttingXpForLevel } from "@/adventure/v2/woodcuttingProgression";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";

const WHETSTONE_3_COSTS = { v2_arcane_alloy: 20, v2_precious_ingot: 10, v2_basic_ingot: 10, v2_rough_gem: 5 };
const BRACE_3_COSTS = { v2_processed_masterwood: 20, v2_processed_hardwood: 10, v2_processed_softwood: 10 };

function seedLevels({ mining = 100, woodcutting = 100 } = {}) {
  mocks.store.set(WOODCUTTING_LOG_KEY, { levelCurveVersion: 2, cuts: 1, xp: woodcuttingXpForLevel(woodcutting) });
  mocks.store.set(MINING_LOG_KEY, { levelCurveVersion: 2, successes: 1, xp: miningXpForLevel(mining) });
}

function craft(itemId: unknown, quantity: unknown) {
  return POST(
    new Request("http://test.local/api/v2/life-workshop/battle-prep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, quantity }),
    }),
  );
}

function rowOf(json: { rows: BattlePrepCraftRow[] }, id: string) {
  return json.rows.find((row) => row.id === id);
}

afterEach(() => {
  mocks.store.clear();
  mocks.upsertSave.mockClear();
});

describe("전투 준비물 제작", () => {
  it("채광 Lv.35 이상이 상급 숫돌을 만든다", async () => {
    seedLevels({ mining: 40 });
    mocks.store.set("character.v2", {
      gold: 7,
      materials: { v2_arcane_alloy: 40, v2_precious_ingot: 20, v2_basic_ingot: 21, v2_rough_gem: 10 },
    });

    const response = await craft("v2_prep_whetstone_3", 2);

    expect(response.status).toBe(200);
    expect(mocks.store.get("character.v2")).toEqual({
      gold: 7,
      materials: { v2_basic_ingot: 1, v2_prep_whetstone_3: 2 },
    });
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, itemId: "v2_prep_whetstone_3", crafted: 2 });
    expect(rowOf(json, "v2_prep_whetstone_3")).toMatchObject({ owned: 2, maxCraftable: 0 });
  });

  it("레벨 미달은 level_required", async () => {
    seedLevels({ mining: 34 });
    mocks.store.set("character.v2", { materials: WHETSTONE_3_COSTS });

    const response = await craft("v2_prep_whetstone_3", 1);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "level_required" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("명장 등급은 주전공 3단계 이상만, 부전공 9단계는 거절한다", async () => {
    seedLevels();
    const materials = { ...WHETSTONE_3_COSTS, v2_master_alloy: 1 };
    mocks.store.set("character.v2", { materials });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "mining", masteryXp: { mining: lifeMajorStageXp("mining", 2) } });
    expect(await (await craft("v2_prep_whetstone_master", 1)).json()).toEqual({ ok: false, error: "major_required" });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "farming",
      minor: "mining",
      masteryXp: { mining: lifeMajorStageXp("mining", 9) },
    });
    const minor = await craft("v2_prep_whetstone_master", 1);
    expect(minor.status).toBe(409);
    expect(await minor.json()).toEqual({ ok: false, error: "major_required" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "mining", masteryXp: { mining: lifeMajorStageXp("mining", 3) } });
    const ok = await craft("v2_prep_whetstone_master", 1);
    expect(ok.status).toBe(200);
    expect(mocks.store.get("character.v2")).toEqual({ materials: { v2_prep_whetstone_master: 1 } });
  });

  it("벌목 주전공은 명장의 보강재를 만들고 명장의 숫돌은 못 만든다", async () => {
    seedLevels();
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "woodcutting",
      masteryXp: { woodcutting: lifeMajorStageXp("woodcutting", 3) },
    });
    mocks.store.set("character.v2", {
      materials: { ...BRACE_3_COSTS, v2_master_wood: 1, ...WHETSTONE_3_COSTS, v2_master_alloy: 1 },
    });

    expect((await craft("v2_prep_brace_master", 1)).status).toBe(200);
    expect(await (await craft("v2_prep_whetstone_master", 1)).json()).toEqual({ ok: false, error: "major_required" });
    expect(mocks.store.get("character.v2")).toEqual({
      materials: { v2_prep_brace_master: 1, ...WHETSTONE_3_COSTS, v2_master_alloy: 1 },
    });
  });

  it("재료 부족·수량 오류·모르는 품목은 세이브를 바꾸지 않는다", async () => {
    seedLevels();
    mocks.store.set("character.v2", { materials: { v2_processed_softwood: 79 } });

    const short = await craft("v2_prep_brace_1", 2);
    expect(short.status).toBe(409);
    expect(await short.json()).toEqual({ ok: false, error: "not_enough_materials" });
    expect((await craft("v2_prep_brace_1", 0)).status).toBe(400);
    expect((await craft("v2_prep_brace_1", 21)).status).toBe(400);
    const unknown = await craft("v2_timber", 1);
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ ok: false, error: "bad_item" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("GET은 현재 레벨과 보유량으로 8행을 돌려준다", async () => {
    seedLevels({ mining: 25, woodcutting: 100 });
    mocks.store.set("character.v2", { materials: { v2_processed_softwood: 95, v2_prep_brace_1: 3 } });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.rows).toHaveLength(8);
    expect(rowOf(json, "v2_prep_brace_1")).toMatchObject({ owned: 3, blocked: null, maxCraftable: 2 });
    expect(rowOf(json, "v2_prep_whetstone_3")).toMatchObject({ blocked: "level", requiredLevel: 35 });
    expect(rowOf(json, "v2_prep_whetstone_2")).toMatchObject({ blocked: null, maxCraftable: 0 });
    expect(rowOf(json, "v2_prep_brace_master")).toMatchObject({ blocked: "major" });
  });
});
