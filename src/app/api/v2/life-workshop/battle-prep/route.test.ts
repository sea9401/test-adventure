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
import { lockSaveForUpdate } from "@/lib/server/savesKv";
import type { BattlePrepCraftRow } from "@/adventure/data/v2/battlePrep";
import { FISHING_PROGRESS_KEY, fishingLevelXpThreshold } from "@/adventure/v2/fishingProgression";
import { FISHING_STOCK_KEY } from "@/adventure/v2/fishingStock";
import { LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { woodcuttingXpForLevel } from "@/adventure/v2/woodcuttingProgression";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";

const WHETSTONE_3_COSTS = { v2_arcane_alloy: 20, v2_precious_ingot: 10, v2_basic_ingot: 10, v2_rough_gem: 5 };
const BRACE_3_COSTS = { v2_processed_masterwood: 20, v2_processed_hardwood: 10, v2_processed_softwood: 10 };

function seedLevels({ mining = 100, woodcutting = 100, fishing = 1 } = {}) {
  mocks.store.set(FISHING_PROGRESS_KEY, { levelCurveVersion: 2, xp: fishingLevelXpThreshold(fishing) });
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

  it("GET은 현재 레벨과 보유량으로 12행을 돌려준다", async () => {
    seedLevels({ mining: 25, woodcutting: 100 });
    mocks.store.set("character.v2", { materials: { v2_processed_softwood: 95, v2_prep_brace_1: 3 } });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.rows).toHaveLength(12);
    expect(rowOf(json, "v2_prep_brace_1")).toMatchObject({ owned: 3, blocked: null, maxCraftable: 2 });
    expect(rowOf(json, "v2_prep_whetstone_3")).toMatchObject({ blocked: "level", requiredLevel: 35 });
    expect(rowOf(json, "v2_prep_whetstone_2")).toMatchObject({ blocked: null, maxCraftable: 0 });
    expect(rowOf(json, "v2_prep_brace_master")).toMatchObject({ blocked: "major" });
  });
});

describe("어유 제작", () => {
  const RARE = "danger_catch_ironjaw_tuna";
  const EPIC = "danger_catch_reef_maw_grouper";
  const daily = { date: "2026-11-13", awarded: { catch_quality: 25 } };

  it("낚시 Lv.25가 상급 어유를 만들면 어획물 재고와 위험 해역 어획물이 함께 줄고 하루 기록은 그대로다", async () => {
    seedLevels({ fishing: 25 });
    mocks.store.set("character.v2", { gold: 7, materials: { [RARE]: 3, [EPIC]: 2 } });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_quality: 9, catch_special: 2, catch_common: 5 }, daily });

    const response = await craft("v2_prep_fishoil_3", 2);

    expect(response.status).toBe(200);
    expect(mocks.store.get("character.v2")).toEqual({ gold: 7, materials: { [EPIC]: 1, v2_prep_fishoil_3: 2 } });
    expect(mocks.store.get(FISHING_STOCK_KEY)).toEqual({ version: 1, items: { catch_quality: 1, catch_common: 5 }, daily });
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, itemId: "v2_prep_fishoil_3", crafted: 2 });
    expect(rowOf(json, "v2_prep_fishoil_3")).toMatchObject({
      owned: 2,
      maxCraftable: 0,
      costs: [
        { id: "catch_quality", name: "고급 어획물", need: 4, owned: 1 },
        { id: "catch_special", name: "특급 어획물", need: 1, owned: 0 },
        { id: "danger_catch:rare", name: "위험 해역 희귀 이상 어획물", need: 2, owned: 1 },
      ],
    });
  });

  it("낚시 레벨·어획물·위험 해역 어획물이 모자라면 두 세이브를 바꾸지 않는다", async () => {
    mocks.store.set("character.v2", { materials: { [RARE]: 2 } });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_quality: 4, catch_special: 1 } });

    seedLevels({ fishing: 24 });
    const low = await craft("v2_prep_fishoil_3", 1);
    expect(low.status).toBe(409);
    expect(await low.json()).toEqual({ ok: false, error: "level_required" });

    seedLevels({ fishing: 25 });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_quality: 3, catch_special: 1 } });
    expect(await (await craft("v2_prep_fishoil_3", 1)).json()).toEqual({ ok: false, error: "not_enough_materials" });

    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_quality: 4, catch_special: 1 } });
    mocks.store.set("character.v2", { materials: { [RARE]: 1, danger_catch_razor_sardine: 30 } });
    expect(await (await craft("v2_prep_fishoil_3", 1)).json()).toEqual({ ok: false, error: "not_enough_materials" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("어획물 재고 세이브가 없는 계정도 조회가 되고 제작은 재료 부족으로 거절된다", async () => {
    seedLevels({ fishing: 1 });
    mocks.store.set("character.v2", { materials: {} });

    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(rowOf(json, "v2_prep_fishoil_1")).toMatchObject({
      blocked: null,
      maxCraftable: 0,
      costs: [
        { id: "catch_common", need: 3, owned: 0 },
        { id: "catch_fresh", need: 1, owned: 0 },
      ],
    });
    expect(rowOf(json, "v2_prep_fishoil_2")).toMatchObject({ blocked: "level", requiredLevel: 15 });
    expect(await (await craft("v2_prep_fishoil_1", 1)).json()).toEqual({ ok: false, error: "not_enough_materials" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("명장의 어유는 낚시 주전공 3단계 이상만, 부전공 9단계는 거절한다", async () => {
    seedLevels({ fishing: 100 });
    mocks.store.set("character.v2", { materials: { [EPIC]: 2, v2_master_catch: 1 } });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_special: 2, catch_legendary: 1 } });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "mining",
      minor: "fishing",
      masteryXp: { fishing: lifeMajorStageXp("fishing", 9), mining: lifeMajorStageXp("mining", 9) },
    });
    const minor = await craft("v2_prep_fishoil_master", 1);
    expect(minor.status).toBe(409);
    expect(await minor.json()).toEqual({ ok: false, error: "major_required" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "fishing", masteryXp: { fishing: lifeMajorStageXp("fishing", 3) } });
    const ok = await craft("v2_prep_fishoil_master", 1);
    expect(ok.status).toBe(200);
    expect(mocks.store.get("character.v2")).toEqual({ materials: { v2_prep_fishoil_master: 1 } });
    expect(mocks.store.get(FISHING_STOCK_KEY)).toEqual({ version: 1, items: {} });
  });

  it("어유는 낚시 챔질과 같은 순서(어획물 재고 → 캐릭터)로 잠근다", async () => {
    seedLevels({ fishing: 1 });
    mocks.store.set("character.v2", { materials: {} });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_common: 3, catch_fresh: 1 } });
    vi.mocked(lockSaveForUpdate).mockClear();

    expect((await craft("v2_prep_fishoil_1", 1)).status).toBe(200);

    expect(vi.mocked(lockSaveForUpdate).mock.calls.map((call) => call[2])).toEqual([FISHING_STOCK_KEY, "character.v2"]);
  });

  it("숫돌을 만들 때는 어획물 재고 세이브를 저장하지 않는다", async () => {
    seedLevels({ mining: 1 });
    mocks.store.set("character.v2", { materials: { v2_basic_ingot: 40, v2_mining_stone: 20 } });
    mocks.store.set(FISHING_STOCK_KEY, { version: 1, items: { catch_common: 5 } });

    vi.mocked(lockSaveForUpdate).mockClear();
    const response = await craft("v2_prep_whetstone_1", 1);

    expect(response.status).toBe(200);
    expect(mocks.upsertSave).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSave.mock.calls[0][2]).toBe("character.v2");
    expect(vi.mocked(lockSaveForUpdate).mock.calls.map((call) => call[2])).not.toContain(FISHING_STOCK_KEY);
  });
});
