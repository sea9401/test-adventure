import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  userId: "u-upkeep" as string | null,
  grantedTitles: [] as string[],
  ownedTitles: new Set<string>(),
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
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async (_tx, _uid, titleId: string) => {
    if (mocks.ownedTitles.has(titleId)) return false;
    mocks.ownedTitles.add(titleId);
    mocks.grantedTitles.push(titleId);
    return true;
  }),
}));

import {
  GATHERING_PIONEER_TITLE_ID,
  GATHERING_SITE_MASTER_TITLE_ID,
} from "@/adventure/data/titles";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { GATHERING_SITES } from "@/adventure/v2/gatheringSiteUpkeep";
import {
  LIFE_MAJOR_PRODUCT_ID,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorStageXp,
} from "@/adventure/v2/lifeMajor";
import { LIFE_WORKSHOP_SAVE_KEY } from "@/adventure/v2/lifeWorkshop";
import { GET, POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://test.local/api/v2/life-workshop/upkeep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function seedMaterials(materials: Record<string, number>, extra: Record<string, unknown> = {}) {
  mocks.store.set("character.v2", { gold: 77, materials, ...extra });
}

function savedMaterials(): Record<string, number> {
  return (mocks.store.get("character.v2") as { materials: Record<string, number> }).materials;
}

function savedUpkeep(): Record<string, number> | undefined {
  return (mocks.store.get(LIFE_WORKSHOP_SAVE_KEY) as { siteUpkeep?: Record<string, number> })
    ?.siteUpkeep;
}

afterEach(() => {
  mocks.store.clear();
  mocks.userId = "u-upkeep";
  mocks.grantedTitles.length = 0;
  mocks.ownedTitles.clear();
  vi.clearAllMocks();
});

describe("GET /api/v2/life-workshop/upkeep", () => {
  it("로그인하지 않으면 401", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ siteId: "iron" })).status).toBe(401);
  });

  it("정비 단계, 정비에 쓰는 재료, 명장 정비 가능 여부를 돌려준다", async () => {
    seedMaterials({
      [MINING_MATERIAL_ID.iron]: 2_500,
      [MINING_MATERIAL_ID.stone]: 90,
      [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 12,
      v2_unrelated: 5,
    });
    mocks.store.set(LIFE_WORKSHOP_SAVE_KEY, { siteUpkeep: { iron: 2, pine: 5 } });
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "woodcutting",
      minor: "mining",
      masteryXp: {
        woodcutting: lifeMajorStageXp("woodcutting", 3),
        mining: lifeMajorStageXp("mining", 9),
      },
    });

    const json = await (await GET()).json();
    expect(json).toEqual({
      ok: true,
      stages: { iron: 2, pine: 5 },
      materials: {
        [MINING_MATERIAL_ID.iron]: 2_500,
        [MINING_MATERIAL_ID.stone]: 90,
        [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 12,
      },
      // 부전공은 단계가 높아도 명장 정비를 열지 못한다.
      masterUnlocked: { mining: false, woodcutting: true },
    });
  });
});

describe("POST /api/v2/life-workshop/upkeep", () => {
  it("모르는 채집지는 400", async () => {
    const response = await post({ siteId: "stone" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "bad_request" });
  });

  it("재료를 차감하고 단계를 올리며 공방의 다른 값은 그대로 둔다", async () => {
    seedMaterials({
      [MINING_MATERIAL_ID.iron]: 2_000,
      [MINING_MATERIAL_ID.stone]: 200,
      v2_unrelated: 5,
    });
    mocks.store.set(LIFE_WORKSHOP_SAVE_KEY, {
      tools: { woodcutting: 3, mining: 2 },
      specializations: { mining: "miner" },
      siteUpkeep: { pine: 1 },
    });

    const response = await post({ siteId: "iron" });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      stages: { pine: 1, iron: 1 },
      materials: { [MINING_MATERIAL_ID.iron]: 80 },
      result: { siteId: "iron", stage: 1, grantedTitleIds: [] },
    });
    expect(json.materials[MINING_MATERIAL_ID.stone]).toBeUndefined();

    expect(savedMaterials()).toEqual({ [MINING_MATERIAL_ID.iron]: 80, v2_unrelated: 5 });
    expect((mocks.store.get("character.v2") as { gold: number }).gold).toBe(77);
    expect(mocks.store.get(LIFE_WORKSHOP_SAVE_KEY)).toMatchObject({
      tools: { woodcutting: 3, mining: 2 },
      specializations: { mining: "miner" },
      siteUpkeep: { pine: 1, iron: 1 },
    });
  });

  it("재료가 모자라면 409이고 아무것도 저장하지 않는다", async () => {
    seedMaterials({ [MINING_MATERIAL_ID.iron]: 1_919, [MINING_MATERIAL_ID.stone]: 200 });
    const short = await post({ siteId: "iron" });
    expect(short.status).toBe(409);
    expect(await short.json()).toEqual({ ok: false, error: "not_enough_materials" });

    seedMaterials({ [MINING_MATERIAL_ID.iron]: 1_920, [MINING_MATERIAL_ID.stone]: 199 });
    const noStone = await post({ siteId: "iron" });
    expect(await noStone.json()).toEqual({ ok: false, error: "not_enough_byproducts" });
    expect(savedUpkeep()).toBeUndefined();
    expect(savedMaterials()[MINING_MATERIAL_ID.iron]).toBe(1_920);
  });

  it("6단계는 그 생활의 주전공 명장 3단계가 있어야 하고 명장 산물을 쓴다", async () => {
    seedMaterials({
      [WOODCUTTING_MATERIAL_ID.cypress]: 13_200,
      [MINING_MATERIAL_ID.roughGem]: 600,
      [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 25,
    });
    mocks.store.set(LIFE_WORKSHOP_SAVE_KEY, { siteUpkeep: { cypress: 5 } });
    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "mining",
      masteryXp: { mining: lifeMajorStageXp("mining", 10) },
    });
    const locked = await post({ siteId: "cypress" });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ ok: false, error: "upkeep_master_locked" });

    mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
      major: "woodcutting",
      masteryXp: { woodcutting: lifeMajorStageXp("woodcutting", 3) },
    });
    const done = await post({ siteId: "cypress" });
    expect(done.status).toBe(200);
    expect((await done.json()).result).toMatchObject({ siteId: "cypress", stage: 6 });
    expect(savedMaterials()).toEqual({ [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 5 });

    const maxed = await post({ siteId: "cypress" });
    expect(await maxed.json()).toEqual({ ok: false, error: "upkeep_max" });
  });

  it("조건을 처음 채운 요청에서 칭호를 준다", async () => {
    // 11곳 2단계 + 편백나무숲 1단계 = 합계 23. 편백나무숲을 2단계로 올리면 24.
    const stages = Object.fromEntries(GATHERING_SITES.map((site) => [site.id, 2]));
    mocks.store.set(LIFE_WORKSHOP_SAVE_KEY, { siteUpkeep: { ...stages, cypress: 1 } });
    seedMaterials({
      [WOODCUTTING_MATERIAL_ID.cypress]: 1_760 + 3_300,
      [MINING_MATERIAL_ID.stone]: 400,
      [MINING_MATERIAL_ID.coal]: 250,
    });

    const first = await (await post({ siteId: "cypress" })).json();
    expect(first.result.grantedTitleIds).toEqual([GATHERING_PIONEER_TITLE_ID]);

    // 이미 받은 칭호는 다시 주지 않는다.
    const second = await (await post({ siteId: "cypress" })).json();
    expect(second.result).toMatchObject({ stage: 3, grantedTitleIds: [] });
    expect(mocks.grantedTitles).toEqual([GATHERING_PIONEER_TITLE_ID]);
    expect(mocks.grantedTitles).not.toContain(GATHERING_SITE_MASTER_TITLE_ID);
  });
});
