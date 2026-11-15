import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  userId: "u-gem" as string | null,
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => mocks.userId) }));
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
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  }),
}));

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { LIFE_MAJOR_PRODUCT_ID, LIFE_MAJOR_SAVE_KEY, lifeMajorStageXp } from "@/adventure/v2/lifeMajor";
import { miningXpForLevel } from "@/adventure/v2/miningProgression";
import { MINING_LOG_KEY } from "@/adventure/v2/miningSession";
import { GET, POST } from "./route";

const ROUGH = MINING_MATERIAL_ID.roughGem;
const ALLOY = LIFE_MAJOR_PRODUCT_ID.mining;

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/life-workshop/gem-cut", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function seed(materials: Record<string, number>, miningLevel = 30) {
  mocks.store.set("character.v2", { gold: 5, materials });
  mocks.store.set(MINING_LOG_KEY, { levelCurveVersion: 2, successes: 1, xp: miningXpForLevel(miningLevel) });
}

afterEach(() => {
  mocks.store.clear();
  mocks.userId = "u-gem";
  vi.restoreAllMocks();
});

describe("/api/v2/life-workshop/gem-cut", () => {
  it("로그인하지 않으면 401", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ mode: "normal", count: 1 })).status).toBe(401);
  });

  it("조회는 재료 보유량, 채광 레벨, 명장 세공 가능 여부를 돌려준다", async () => {
    seed({ [ROUGH]: 130, [ALLOY]: 4, v2_cut_gem_refined: 2, v2_unrelated: 9 }, 45);
    expect(await (await GET()).json()).toEqual({
      ok: true,
      miningLevel: 45,
      masterUnlocked: false,
      roughGems: 130,
      masterAlloy: 4,
      cutGems: { v2_cut_gem_refined: 2 },
    });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "mining",
      masteryXp: { mining: lifeMajorStageXp("mining", 3) },
    });
    expect((await (await GET()).json()).masterUnlocked).toBe(true);
  });

  it("세공하면 원석 보석을 쓰고 등급별 결과와 남은 재료를 돌려준다", async () => {
    seed({ [ROUGH]: 130, other: 1 });
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.99);
    const response = await post({ mode: "normal", count: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      miningLevel: 30,
      masterUnlocked: false,
      roughGems: 10,
      masterAlloy: 0,
      cutGems: { v2_cut_gem_polished: 1, v2_cut_gem_flawless: 1 },
      result: { mode: "normal", count: 2, results: { polished: 1, refined: 0, flawless: 1 } },
    });
    expect(mocks.store.get("character.v2")).toEqual({
      gold: 5,
      materials: { [ROUGH]: 10, other: 1, v2_cut_gem_polished: 1, v2_cut_gem_flawless: 1 },
    });
  });

  it("명장 세공은 채광 주전공 명장 3단계와 명장 합금이 필요하다", async () => {
    seed({ [ROUGH]: 60, [ALLOY]: 3 }, 100);
    const locked = await post({ mode: "master", count: 1 });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ ok: false, error: "master_locked" });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "mining",
      masteryXp: { mining: lifeMajorStageXp("mining", 3) },
    });
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    const done = await post({ mode: "master", count: 1 });
    expect((await done.json()).result.results).toEqual({ polished: 0, refined: 1, flawless: 0 });
    expect((mocks.store.get("character.v2") as { materials: object }).materials).toEqual({
      v2_cut_gem_refined: 1,
    });
  });

  it("조건이 안 되면 409, 입력이 틀리면 400이고 아무것도 저장하지 않는다", async () => {
    seed({ [ROUGH]: 59 });
    expect(await (await post({ mode: "normal", count: 1 })).json()).toEqual({
      ok: false,
      error: "not_enough_rough_gems",
    });
    seed({ [ROUGH]: 600 }, 29);
    const low = await post({ mode: "normal", count: 1 });
    expect(low.status).toBe(409);
    expect(await low.json()).toEqual({ ok: false, error: "mining_level_required" });

    for (const body of [{ mode: "fancy", count: 1 }, { mode: "normal", count: 0 }, { mode: "normal", count: 101 }, {}]) {
      const response = await post(body);
      expect(response.status).toBe(400);
    }
    expect((mocks.store.get("character.v2") as { materials: Record<string, number> }).materials).toEqual({
      [ROUGH]: 600,
    });
  });
});
