import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "u-major") }));
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

import { GET, POST } from "@/app/api/v2/life-major/route";
import { POST as CRAFT_CATALYST } from "@/app/api/v2/life-major/catalyst/route";
import { COOKING_SAVE_KEY, cookingLevelXpThreshold, emptyCookingState } from "@/adventure/v2/cooking/state";
import { emptyFarmState, FARM_SAVE_KEY, farmingLevelXpThreshold } from "@/adventure/v2/farm";
import {
  emptyFishingProgression,
  FISHING_PROGRESS_KEY,
  fishingLevelXpThreshold,
} from "@/adventure/v2/fishingProgression";
import {
  LIFE_MAJOR_CHANGE_COOLDOWN_MS,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorStageXp,
  type LifeMajorActivityView,
} from "@/adventure/v2/lifeMajor";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { woodcuttingXpForLevel } from "@/adventure/v2/woodcuttingProgression";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";

const NOW = Date.parse("2026-10-10T12:00:00+09:00");

function seedLevels({ farming = 100, mining = 100, fishing = 100, woodcutting = 50, cooking = 100 } = {}) {
  const farm = emptyFarmState(NOW);
  mocks.store.set(FARM_SAVE_KEY, {
    ...farm,
    levelCurveVersion: 2,
    stats: { ...farm.stats, farmingXp: farmingLevelXpThreshold(farming) },
  });
  mocks.store.set(WOODCUTTING_LOG_KEY, { levelCurveVersion: 2, cuts: 1, xp: woodcuttingXpForLevel(woodcutting) });
  mocks.store.set(MINING_LOG_KEY, { levelCurveVersion: 2, successes: 1, xp: miningXpForLevel(mining) });
  mocks.store.set(FISHING_PROGRESS_KEY, {
    ...emptyFishingProgression(),
    levelCurveVersion: 2,
    xp: fishingLevelXpThreshold(fishing),
  });
  mocks.store.set(COOKING_SAVE_KEY, { ...emptyCookingState(NOW), xp: cookingLevelXpThreshold(cooking) });
}

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/life-major", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => {
  mocks.store.clear();
  mocks.upsertSave.mockClear();
  vi.restoreAllMocks();
});

describe("GET /api/v2/life-major", () => {
  it("생활별 자격·단계·효과·산물 확률을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "mining",
      masteryXp: { mining: lifeMajorStageXp("mining", 2) },
    });
    const json = await (await GET()).json();
    expect(json).toMatchObject({ ok: true, major: "mining", minor: null, nextChangeAt: null });
    const byId = Object.fromEntries(
      (json.activities as LifeMajorActivityView[]).map((entry) => [entry.id, entry]),
    );
    expect(byId.woodcutting).toMatchObject({ level: 50, eligible: false });
    expect(byId.mining).toMatchObject({
      level: 100,
      eligible: true,
      role: "major",
      stage: 2,
      effectText: "추가 광석 확률 +2%p",
    });
    expect(byId.mining.productChancePct).toBeCloseTo(0.8);
    expect(byId.farming).toMatchObject({ role: null, stage: 0, productChancePct: 0 });
  });
});

describe("POST /api/v2/life-major", () => {
  it("Lv.100 생활을 주전공·부전공으로 지정한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    const response = await post({ major: "farming", minor: "fishing" });
    expect(response.status).toBe(200);
    expect(mocks.store.get(LIFE_MAJOR_SAVE_KEY)).toMatchObject({ major: "farming", minor: "fishing", lastChangedAt: null });
    expect((await response.json()).view.major).toBe("farming");
  });

  it("Lv.100 미만 생활은 409 not_level_100", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    const response = await post({ major: "woodcutting", minor: null });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "not_level_100" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("쿨다운 중 변경은 409 change_cooldown 과 다음 변경 시각", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "farming", lastChangedAt: NOW - 86_400_000 });
    const response = await post({ major: "mining", minor: null });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "change_cooldown",
      nextChangeAt: NOW - 86_400_000 + LIFE_MAJOR_CHANGE_COOLDOWN_MS,
    });
  });

  it.each([[{}], [{ major: 3 }], ["x"]])("잘못된 본문 %j 는 400", async (body) => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    const response = await post(body);
    expect(response.status).toBe(400);
  });
});

describe("단련 촉매 제작", () => {
  const craft = (quantity: unknown) =>
    CRAFT_CATALYST(
      new Request("http://test.local/api/v2/life-major/catalyst", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity }),
      }),
    );
  const major3 = { major: "mining", masteryXp: { mining: 0 } };

  it("채광 주전공 3단계 이상이 명장 합금 2 + 명장 목재 1로 만든다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { ...major3, masteryXp: { mining: lifeMajorStageXp("mining", 3) } });
    mocks.store.set("character.v2", { gold: 7, materials: { v2_master_alloy: 5, v2_master_wood: 2 } });
    const response = await craft(2);
    expect(response.status).toBe(200);
    expect(mocks.store.get("character.v2")).toEqual({
      gold: 7,
      materials: { v2_master_alloy: 1, v2_tempering_catalyst: 2 },
    });
    const json = await response.json();
    expect(json.view.crafting).toMatchObject({ catalystUnlocked: true, alloy: 1, wood: 0, catalysts: 2 });
  });

  it("단계 미달·부전공·재료 부족·잘못된 수량을 거절한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    seedLevels();
    mocks.store.set("character.v2", { materials: { v2_master_alloy: 10, v2_master_wood: 10 } });
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "mining", masteryXp: { mining: lifeMajorStageXp("mining", 2) } });
    expect(await (await craft(1)).json()).toMatchObject({ error: "catalyst_locked" });
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "farming", minor: "mining", masteryXp: { mining: lifeMajorStageXp("mining", 9) } });
    expect(await (await craft(1)).json()).toMatchObject({ error: "catalyst_locked" });
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "mining", masteryXp: { mining: lifeMajorStageXp("mining", 3) } });
    mocks.store.set("character.v2", { materials: { v2_master_alloy: 3, v2_master_wood: 1 } });
    const short = await craft(2);
    expect(short.status).toBe(409);
    expect(await short.json()).toMatchObject({ error: "not_enough_master_product" });
    expect((await craft(0)).status).toBe(400);
    expect((await craft(21)).status).toBe(400);
    expect(mocks.store.get("character.v2")).toEqual({ materials: { v2_master_alloy: 3, v2_master_wood: 1 } });
  });
});
