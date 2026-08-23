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
  ensureUser: vi.fn(async () => "u-farm-endgame"),
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

import { POST } from "@/app/api/v2/farm/endgame-shop/route";
import { GET } from "@/app/api/v2/farm/route";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import {
  LIFE_WORKSHOP_SAVE_KEY,
  emptyLifeWorkshopState,
  type LifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";

const NOW = 1_800_000_000_000;

function completedFarm(reputation = 10_000): FarmState {
  const farm = emptyFarmState(NOW);
  return {
    ...farm,
    plots: Array.from({ length: 8 }, (_, index) => ({
      id: `plot-${index + 1}`,
      cropId: null,
      plantedAt: null,
      readyAt: null,
    })),
    ranch: {
      ...farm.ranch,
      pens: Object.fromEntries(
        Object.entries(farm.ranch.pens).map(([id, pen]) => [id, { ...pen, unlocked: true }]),
      ) as FarmState["ranch"]["pens"],
    },
    stats: { ...farm.stats, reputation },
  };
}

function buy(itemId: string) {
  return POST(
    new Request("http://test.local/api/v2/farm/endgame-shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
    }),
  );
}

describe("farm endgame shop route", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    store.clear();
    upsertSave.mockClear();
    vi.restoreAllMocks();
  });

  it("농장 조회가 후반 교환소 진행도와 보유 칭호를 반환한다", async () => {
    store.set(FARM_SAVE_KEY, completedFarm(10_000));
    store.set("adventure-log.v2", {
      titles: { farm_bountiful_hand: { obtainedAt: NOW } },
    });

    const response = await GET();

    expect(await response.json()).toMatchObject({
      endgameShop: {
        unlocked: true,
        plots: 8,
        pens: 4,
        ownedTitleIds: ["farm_bountiful_hand"],
      },
    });
  });

  it("사료와 거름을 각각 지급하고 정확한 증표를 사용한다", async () => {
    store.set(FARM_SAVE_KEY, completedFarm(100));
    const feed = await buy("ranch-feed-bundle");
    expect(feed.status).toBe(200);
    expect((store.get(FARM_SAVE_KEY) as FarmState).inventory.compound_feed).toBe(5);
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(20);
    expect(await feed.json()).toMatchObject({
      endgameShopResult: { itemId: "ranch-feed-bundle", costReputation: 20 },
    });

    store.set(FARM_SAVE_KEY, completedFarm(100));
    store.set(LIFE_WORKSHOP_SAVE_KEY, emptyLifeWorkshopState());
    const fertilizer = await buy("fertilizer-bundle");
    expect(fertilizer.status).toBe(200);
    expect(
      (store.get(LIFE_WORKSHOP_SAVE_KEY) as LifeWorkshopState).crafting.balances
        .organic_fertilizer,
    ).toBe(3);
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(24);
    expect(await fertilizer.json()).toMatchObject({ fertilizerBalance: 3 });
  });

  it("칭호를 한 번만 지급하고 중복 요청에서는 증표를 보존한다", async () => {
    store.set(FARM_SAVE_KEY, completedFarm(2_000));
    expect((await buy("title-bountiful-hand")).status).toBe(200);
    const spent = (store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent;
    const duplicate = await buy("title-bountiful-hand");
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ error: "already_owned" });
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(spent);
  });

  it.each([
    {
      farm: emptyFarmState(NOW),
      itemId: "ranch-feed-bundle",
      status: 409,
      error: "endgame_shop_locked",
    },
    {
      farm: completedFarm(19),
      itemId: "ranch-feed-bundle",
      status: 409,
      error: "not_enough_reputation",
    },
    {
      farm: completedFarm(10_000),
      itemId: "missing",
      status: 400,
      error: "shop_item_not_found",
    },
  ])("$error 실패 시 저장을 변경하지 않는다", async ({ farm, itemId, status, error }) => {
    store.set(FARM_SAVE_KEY, farm);
    const before = structuredClone(farm);

    const response = await buy(itemId);

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
    expect(store.get(FARM_SAVE_KEY)).toEqual(before);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
