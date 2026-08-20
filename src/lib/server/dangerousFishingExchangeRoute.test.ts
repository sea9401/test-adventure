import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, auth, rateLimit, grantTitle } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  auth: { userId: "u-exchange" as string | null },
  rateLimit: vi.fn(() => null as Response | null),
  grantTitle: vi.fn(async (_tx: unknown, _userId: string, titleId: string, obtainedAt: number) => {
    const current = (store.get("adventure-log.v2") ?? {}) as {
      titles?: Record<string, { obtainedAt: number }>;
    };
    if (current.titles?.[titleId]) return false;
    store.set("adventure-log.v2", {
      ...current,
      titles: { ...current.titles, [titleId]: { obtainedAt } },
    });
    return true;
  }),
}));

let transactionTail = Promise.resolve();

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => auth.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: rateLimit,
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: grantTitle,
  ownedTitleIdsOf: (raw: unknown) => {
    const titles = (raw as { titles?: unknown } | undefined)?.titles;
    return titles && typeof titles === "object" ? Object.keys(titles) : [];
  },
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = transactionTail;
      let release = () => {};
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const insertion = {
          values: () => ({ onConflictDoNothing: async () => undefined }),
        };
        const query: Record<string, unknown> = {};
        query.from = () => query;
        query.where = () => query;
        query.for = () => query;
        query.limit = async () => [{ id: "u-exchange" }];
        return await callback({
          insert: () => insertion,
          select: () => query,
        });
      } finally {
        release();
      }
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import {
  GET,
  POST,
} from "@/app/api/v2/dangerous-fishing/exchange/route";
import { dangerousBossMaterialId } from "@/adventure/data/v2/dangerousFishing";
import {
  DANGEROUS_FISHING_SAVE_KEY,
  emptyDangerousFishingState,
  parseDangerousFishingState,
} from "@/adventure/v2/dangerousFishingState";
import {
  FISHING_PROGRESS_KEY,
  emptyFishingProgression,
} from "@/adventure/v2/fishingProgression";
import { FISHING_WALLET_KEY } from "@/lib/server/fishing/coins";
import { parseDangerousFishingExchangeState } from "@/lib/server/dangerousFishingExchange";

const NOW = 1_800_100_000_000;

function exchangeRequest(body: Record<string, unknown>) {
  return new Request("http://test/api/v2/dangerous-fishing/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function requestBody(
  overrides: Partial<{
    operationId: string;
    entryId: string;
    batches: number;
    selectedMaterials: Record<string, number>;
  }> = {},
) {
  return {
    operationId: "4fd3980e-0d2f-4f0d-8214-0b7e51bd52f4",
    entryId: "token_tidal_to_luminous_bait",
    batches: 1,
    ...overrides,
  };
}

function seedUnlocked(materials: Record<string, number> = {}) {
  store.clear();
  auth.userId = "u-exchange";
  store.set("character.v2", { materials, museunCosmetics: {} });
  store.set(FISHING_PROGRESS_KEY, {
    ...emptyFishingProgression(),
    xp: 14 ** 2 * 35,
  });
  store.set(FISHING_WALLET_KEY, { coins: 100_000 });
  store.set(DANGEROUS_FISHING_SAVE_KEY, emptyDangerousFishingState());
}

function savedCharacter() {
  return store.get("character.v2") as {
    materials: Record<string, number>;
    museunCosmetics?: { permanentOwned?: string[] };
  };
}

function savedDangerous() {
  return parseDangerousFishingState(store.get(DANGEROUS_FISHING_SAVE_KEY));
}

describe("위험 해역 교환 Route Handler", () => {
  beforeEach(() => {
    transactionTail = Promise.resolve();
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 30 });
    rateLimit.mockReset();
    rateLimit.mockReturnValue(null);
    grantTitle.mockClear();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => vi.restoreAllMocks());

  it("인증과 속도 제한을 적용한다", async () => {
    auth.userId = null;
    expect((await GET()).status).toBe(401);

    auth.userId = "u-exchange";
    const limited = Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
    rateLimit.mockReturnValueOnce(limited);
    expect((await POST(exchangeRequest(requestBody()))).status).toBe(429);
  });

  it("낚시 15레벨 미만과 잘못된 요청 형식을 거부한다", async () => {
    store.set(FISHING_PROGRESS_KEY, {
      ...emptyFishingProgression(),
      xp: 13 ** 2 * 35,
    });
    const locked = await POST(exchangeRequest(requestBody()));
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({ error: "fishing_level_locked" });

    seedUnlocked();
    for (const body of [
      requestBody({ operationId: "not-a-uuid" }),
      requestBody({ batches: 0 }),
      requestBody({ batches: 101 }),
      requestBody({ entryId: "token_tidal_title", batches: 2 }),
      requestBody({ entryId: "unknown" }),
    ]) {
      const response = await POST(exchangeRequest(body));
      expect(response.status).toBe(400);
    }
  });

  it("24시간이 지난 요청을 제거하고 최근 요청 128개만 보존한다", () => {
    const operations = Array.from({ length: 130 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      completedAt: NOW - index,
    }));
    operations.push({
      id: "e923cd52-a912-4518-86ea-a80333733699",
      completedAt: NOW - 24 * 60 * 60 * 1_000,
    });
    const parsed = parseDangerousFishingExchangeState({ operations }, NOW);
    expect(parsed.operations).toHaveLength(128);
    expect(parsed.operations[0]?.completedAt).toBe(NOW);
    expect(parsed.operations).not.toContainEqual(
      expect.objectContaining({ id: "e923cd52-a912-4518-86ea-a80333733699" }),
    );
  });

  it("혼합 희귀 어획물 4개를 핏빛 미끼 5개로 원자 교환한다", async () => {
    seedUnlocked({
      danger_catch_ironjaw_tuna: 2,
      danger_catch_thunder_ray: 2,
    });
    const response = await POST(exchangeRequest(requestBody({
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: {
        danger_catch_ironjaw_tuna: 2,
        danger_catch_thunder_ray: 2,
      },
    })));
    expect(response.status).toBe(200);
    expect(savedCharacter().materials).toEqual({});
    expect(savedDangerous().baitCounts.blood_bait).toBe(5);
  });

  it("다른 등급 선택과 부족한 재료는 아무것도 차감하지 않는다", async () => {
    seedUnlocked({ danger_catch_razor_sardine: 4 });
    const before = structuredClone([...store.entries()]);
    const invalid = await POST(exchangeRequest(requestBody({
      entryId: "catch_rare_to_blood_bait",
      selectedMaterials: { danger_catch_razor_sardine: 4 },
    })));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: "invalid_material_selection",
    });
    expect([...store.entries()]).toEqual(before);

    const insufficient = await POST(exchangeRequest(requestBody({
      operationId: "c95b5d2d-33e1-4a65-881f-83e22776465d",
      entryId: "token_abyss_to_abyss_bait",
    })));
    expect(insufficient.status).toBe(402);
    await expect(insufficient.json()).resolves.toMatchObject({ error: "insufficient_materials" });
  });

  it("증표와 코인을 함께 차감해 최상급 장비를 지급한다", async () => {
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 16 });
    const response = await POST(exchangeRequest(requestBody({ entryId: "token_maelstrom_reel" })));
    expect(response.status).toBe(200);
    expect(savedCharacter().materials).toEqual({
      [dangerousBossMaterialId("tidal_colossus")]: 8,
    });
    expect(savedDangerous().ownedGear.reels).toContain("maelstrom_reel");
    expect(store.get(FISHING_WALLET_KEY)).toMatchObject({ coins: 80_000 });

    const duplicate = await POST(exchangeRequest(requestBody({
      operationId: "f4772354-4cda-4ba0-a1b2-e5404d51b85f",
      entryId: "token_maelstrom_reel",
    })));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: "already_owned" });
  });

  it("낚시 코인이 부족하면 증표와 장비 상태를 바꾸지 않는다", async () => {
    seedUnlocked({ [dangerousBossMaterialId("tidal_colossus")]: 8 });
    store.set(FISHING_WALLET_KEY, { coins: 19_999 });
    const response = await POST(exchangeRequest(requestBody({ entryId: "token_maelstrom_reel" })));
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ error: "insufficient_coins" });
    expect(savedCharacter().materials[dangerousBossMaterialId("tidal_colossus")]).toBe(8);
    expect(savedDangerous().ownedGear.reels).not.toContain("maelstrom_reel");
  });

  it("칭호와 프로필 테두리를 각각 한 번만 지급한다", async () => {
    seedUnlocked({
      [dangerousBossMaterialId("tidal_colossus")]: 25,
      [dangerousBossMaterialId("abyss_kraken")]: 15,
    });
    const title = await POST(exchangeRequest(requestBody({ entryId: "token_tidal_title" })));
    expect(title.status).toBe(200);
    expect(grantTitle).toHaveBeenCalledWith(expect.anything(), "u-exchange", "dangerous_tidal_conqueror", NOW);

    const cosmetic = await POST(exchangeRequest(requestBody({
      operationId: "3d0044ad-f655-43b0-ac21-231b7bcf66ad",
      entryId: "token_abyssal_border",
    })));
    expect(cosmetic.status).toBe(200);
    expect(savedCharacter().museunCosmetics?.permanentOwned).toContain(
      "dangerous_abyssal_profile_border",
    );
  });

  it("같은 operationId 재전송과 동시 요청은 한 번만 차감하고 지급한다", async () => {
    const body = requestBody();
    const [first, second] = await Promise.all([
      POST(exchangeRequest(body)),
      POST(exchangeRequest(body)),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const payloads = await Promise.all([first.json(), second.json()]);
    expect(payloads.filter((payload) => payload.alreadyProcessed)).toHaveLength(1);
    expect(savedDangerous().baitCounts.luminous_bait).toBe(5);
    expect(savedCharacter().materials[dangerousBossMaterialId("tidal_colossus")]).toBe(29);
  });

  it("조회 응답은 해금, 잔액, 보유 상태, 카탈로그를 함께 반환한다", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      unlocked: true,
      fishingLevel: 15,
      fishingCoins: 100_000,
      materials: { [dangerousBossMaterialId("tidal_colossus")]: 30 },
      entries: expect.arrayContaining([
        expect.objectContaining({ id: "token_tidal_to_luminous_bait", maxBatches: 30 }),
      ]),
    });
  });
});
