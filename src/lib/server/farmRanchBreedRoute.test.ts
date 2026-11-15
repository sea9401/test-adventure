import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, upsertSave } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-ranch-breed") }));
vi.mock("@/lib/server/farmingRateLimit", () => ({ enforceFarmingRateLimit: vi.fn(() => null) }));
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

import { POST } from "@/app/api/v2/farm/ranch/breed/route";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  emptyFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import { LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";

const NOW = 1_800_000_000_000;

function seed(inventory: FarmState["inventory"], lineage?: FarmState["ranch"]["lineage"]) {
  const base = emptyFarmState(NOW);
  store.set(FARM_SAVE_KEY, {
    ...base,
    inventory,
    ranch: lineage ? { ...base.ranch, lineage } : base.ranch,
  });
  store.set("skills.v2", { learned: [FARM_CROP_REQUIRED_SKILL_ID], equipped: [] });
}

function breed(slotId: unknown) {
  return POST(
    new Request("http://test.local/api/v2/farm/ranch/breed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId }),
    }),
  );
}

const savedFarm = () => store.get(FARM_SAVE_KEY) as FarmState;

describe("farm ranch breed route", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => {
    store.clear();
    upsertSave.mockClear();
    vi.restoreAllMocks();
  });

  it("교배에 성공하면 재료를 쓰고 혈통 등급을 올린다", async () => {
    seed({ egg: 100, compound_feed: 30 });
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const response = await breed("slot-1");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      ranchBreedResult: { slotId: "slot-1", success: true, grade: 1, fails: 0, chancePct: 50 },
      breeding: { masterUnlocked: false, masterCropHeld: 0 },
    });
    expect(savedFarm().ranch.lineage).toEqual({ "slot-1": { grade: 1, fails: 0 } });
    expect(savedFarm().inventory).toEqual({ egg: 40, compound_feed: 10 });
    // 명장 작물을 쓰지 않았으면 캐릭터 세이브는 쓰지 않는다.
    expect(upsertSave.mock.calls.map((call) => call[2])).toEqual([FARM_SAVE_KEY]);
  });

  it("실패하면 재료만 쓰고 실패 기록을 남긴다", async () => {
    seed({ egg: 60, compound_feed: 20 });
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const json = await (await breed("slot-1")).json();
    expect(json.ranchBreedResult).toMatchObject({ success: false, grade: 0, fails: 1 });
    expect(savedFarm().ranch.lineage).toEqual({ "slot-1": { grade: 0, fails: 1 } });
  });

  it("명장 혈통 교배는 농사 주전공 명장 3단계가 필요하고 명장 작물을 쓴다", async () => {
    seed({ egg: 120, compound_feed: 40 }, { "slot-1": { grade: 3, fails: 0 } });
    store.set("character.v2", { gold: 9, materials: { v2_master_crop: 5 } });
    const locked = await breed("slot-1");
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ ok: false, error: "lineage_master_locked" });

    store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "farming",
      masteryXp: { farming: lifeMajorStageXp("farming", 3) },
    });
    vi.spyOn(Math, "random").mockReturnValue(0);
    const done = await breed("slot-1");
    const json = await done.json();
    expect(json.ranchBreedResult).toMatchObject({ success: true, grade: 4 });
    expect(json.breeding).toEqual({ masterUnlocked: true, masterCropHeld: 3 });
    expect(store.get("character.v2")).toEqual({ gold: 9, materials: { v2_master_crop: 3 } });
  });

  it("재료가 모자라거나 입력이 틀리면 저장하지 않는다", async () => {
    seed({ egg: 59, compound_feed: 20 });
    const short = await breed("slot-1");
    expect(short.status).toBe(409);
    expect(await short.json()).toEqual({ ok: false, error: "not_enough_ranch_products" });
    const bad = await breed("slot-99");
    expect(bad.status).toBe(400);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("씨앗 선별을 배우지 않았으면 목장을 쓸 수 없다", async () => {
    seed({ egg: 100, compound_feed: 30 });
    store.set("skills.v2", { learned: [], equipped: [] });
    const response = await breed("slot-1");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "ranch_locked" });
  });
});
