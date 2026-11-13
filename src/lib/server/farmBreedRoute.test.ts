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

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-farm-breed"),
}));
vi.mock("@/lib/server/farmingRateLimit", () => ({
  enforceFarmingRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
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
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(
    async (_tx, _uid, titleId: string, obtainedAt: number) => {
      const raw = store.get("adventure-log.v2");
      const current = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const titlesRaw = current.titles;
      const titles = titlesRaw && typeof titlesRaw === "object"
        ? titlesRaw as Record<string, { obtainedAt: number }>
        : {};
      if (titles[titleId]) return false;
      store.set("adventure-log.v2", {
        ...current,
        titles: { ...titles, [titleId]: { obtainedAt } },
      });
      return true;
    },
  ),
  ownedTitleIdsOf: vi.fn((raw: unknown) => {
    const titles = (raw as { titles?: Record<string, unknown> } | undefined)?.titles;
    return titles ? Object.keys(titles) : [];
  }),
}));

import { POST } from "@/app/api/v2/farm/breed/route";
import { GET } from "@/app/api/v2/farm/route";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import { LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";

const NOW = 1_800_000_000_000;

function farmWith(
  inventory: FarmState["inventory"],
  breeding?: FarmState["breeding"],
): FarmState {
  return { ...emptyFarmState(NOW), inventory, ...(breeding ? { breeding } : {}) };
}

function setFarmingMajor(stage: number) {
  store.set(LIFE_MAJOR_SAVE_KEY, {
    version: 1,
    major: "farming",
    minor: null,
    lastChangedAt: null,
    masteryXp: { farming: lifeMajorStageXp("farming", stage) },
    masterProductsEarned: {},
  });
}

function breed(cropId: unknown) {
  return POST(
    new Request("http://test.local/api/v2/farm/breed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cropId }),
    }),
  );
}

function savedFarm(): FarmState {
  return store.get(FARM_SAVE_KEY) as FarmState;
}

function savedKeys(): string[] {
  return upsertSave.mock.calls.map((call) => call[2] as string);
}

describe("farm breed route", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    store.clear();
    upsertSave.mockClear();
    vi.restoreAllMocks();
  });

  it("작물을 써서 품종 단계를 올린다", async () => {
    store.set(FARM_SAVE_KEY, farmWith({ wheat: 45, golden_wheat: 3 }));

    const response = await breed("wheat");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      breedResult: {
        cropId: "wheat",
        cropName: "밀",
        stage: 1,
        rareChancePct: 2,
        cost: { crops: 40, rare: 2, masterCrop: 0 },
        grantedTitleIds: [],
      },
      breeding: { masterUnlocked: false, masterCropHeld: 0 },
      farm: { breeding: { wheat: 1 }, inventory: { wheat: 5, golden_wheat: 1 } },
    });
    expect(savedFarm().inventory).toEqual({ wheat: 5, golden_wheat: 1 });
    expect(savedFarm().breeding).toEqual({ wheat: 1 });
    // 1~5단계는 캐릭터 세이브를 건드리지 않는다.
    expect(savedKeys()).toEqual([FARM_SAVE_KEY]);
  });

  it("작물이 모자라면 저장하지 않는다", async () => {
    store.set(FARM_SAVE_KEY, farmWith({ wheat: 39, golden_wheat: 2 }));
    const crops = await breed("wheat");
    expect(crops.status).toBe(409);
    expect(await crops.json()).toEqual({ ok: false, error: "not_enough_crops" });

    store.set(FARM_SAVE_KEY, farmWith({ wheat: 40, golden_wheat: 1 }));
    const rare = await breed("wheat");
    expect(rare.status).toBe(409);
    expect(await rare.json()).toEqual({ ok: false, error: "not_enough_rare_crops" });

    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("명장 품종은 농사 주전공 명장 3단계부터다", async () => {
    store.set(
      FARM_SAVE_KEY,
      farmWith({ wheat: 1_200, golden_wheat: 40 }, { wheat: 5 }),
    );
    store.set("character.v2", { materials: { v2_master_crop: 9 } });

    const noMajor = await breed("wheat");
    expect(noMajor.status).toBe(409);
    expect(await noMajor.json()).toEqual({ ok: false, error: "breeding_master_locked" });

    setFarmingMajor(2);
    const lowStage = await breed("wheat");
    expect(await lowStage.json()).toEqual({ ok: false, error: "breeding_master_locked" });

    // 부전공은 명장 단계가 높아도 올릴 수 없다.
    store.set(LIFE_MAJOR_SAVE_KEY, {
      version: 1,
      major: "mining",
      minor: "farming",
      lastChangedAt: null,
      masteryXp: { farming: lifeMajorStageXp("farming", 10) },
      masterProductsEarned: {},
    });
    const minor = await breed("wheat");
    expect(await minor.json()).toEqual({ ok: false, error: "breeding_master_locked" });

    expect(upsertSave).not.toHaveBeenCalled();
    expect(savedFarm().inventory.wheat).toBe(1_200);
  });

  it("명장 작물이 모자라면 어느 세이브도 저장하지 않는다", async () => {
    store.set(
      FARM_SAVE_KEY,
      farmWith({ wheat: 1_200, golden_wheat: 40 }, { wheat: 5 }),
    );
    store.set("character.v2", { gold: 7, materials: { v2_master_crop: 2 } });
    setFarmingMajor(3);

    const response = await breed("wheat");

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "not_enough_master_crop" });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("명장 품종은 명장 작물 3개를 캐릭터 재료에서 차감한다", async () => {
    store.set(
      FARM_SAVE_KEY,
      farmWith({ wheat: 1_250, golden_wheat: 40 }, { wheat: 5 }),
    );
    store.set("character.v2", {
      gold: 7,
      materials: { v2_master_crop: 3, v2_master_wood: 4 },
    });
    setFarmingMajor(3);

    const response = await breed("wheat");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      breedResult: { stage: 6, rareChancePct: 13, cost: { masterCrop: 3 } },
      breeding: { masterUnlocked: true, masterCropHeld: 0 },
    });
    expect(savedFarm().breeding).toEqual({ wheat: 6 });
    expect(savedFarm().inventory).toEqual({ wheat: 50 });
    expect(store.get("character.v2")).toEqual({
      gold: 7,
      materials: { v2_master_wood: 4 },
    });

    const again = await breed("wheat");
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ ok: false, error: "breeding_max" });
  });

  it("칭호 조건을 처음 채웠을 때만 칭호를 싣는다", async () => {
    store.set(
      FARM_SAVE_KEY,
      farmWith(
        { tomato: 2_000, heirloom_tomato: 100 },
        { wheat: 6, herb: 6, corn: 6, tomato: 3 },
      ),
    );

    const first = await breed("tomato");
    expect(await first.json()).toMatchObject({
      breedResult: { stage: 4, grantedTitleIds: ["farm_breeder"] },
    });
    expect(store.get("adventure-log.v2")).toMatchObject({
      titles: { farm_breeder: { obtainedAt: NOW } },
    });

    const second = await breed("tomato");
    expect(await second.json()).toMatchObject({
      breedResult: { stage: 5, grantedTitleIds: [] },
    });
  });

  it("모르는 작물은 400 이다", async () => {
    store.set(FARM_SAVE_KEY, farmWith({ wheat: 999, golden_wheat: 99 }));

    for (const cropId of ["dragonfruit", "", 7, null, "golden_wheat"]) {
      const response = await breed(cropId);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "bad_request" });
    }
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("농장 조회가 명장 품종 가능 여부와 명장 작물 보유량을 싣는다", async () => {
    store.set(FARM_SAVE_KEY, farmWith({}, { wheat: 2 }));
    const empty = await GET();
    expect(await empty.json()).toMatchObject({
      breeding: { masterUnlocked: false, masterCropHeld: 0 },
      farm: { breeding: { wheat: 2 } },
    });

    store.set("character.v2", { materials: { v2_master_crop: 5.9 } });
    setFarmingMajor(3);
    const major = await GET();
    expect(await major.json()).toMatchObject({
      breeding: { masterUnlocked: true, masterCropHeld: 5 },
    });
  });
});
