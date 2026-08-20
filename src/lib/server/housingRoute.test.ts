import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, housingGate, mastery } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  housingGate: { enabled: true },
  mastery: {
    enabled: false,
    history: [] as Array<Record<string, unknown>>,
  },
}));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/adventure/v2/lifeCrafting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adventure/v2/lifeCrafting")>();
  return {
    ...actual,
    isLifeHousingEnabled: () => housingGate.enabled,
  };
});
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/opsSettings", () => ({
  readCodexMasteryFeatureSettings: vi.fn(async () => ({
    recordingEnabled: false,
    overviewVisible: false,
    rankingVisible: false,
    sealsEnabled: false,
    trophiesEnabled: mastery.enabled,
    monthlyProgressEnabled: false,
    monthlyRankingVisible: false,
    settlementEnabled: false,
    feedEnabled: false,
  })),
}));
vi.mock("@/lib/server/codexMasteryTrophyRepository", () => ({
  readCodexMasteryTrophyHistory: vi.fn(async () => {
    if (!mastery.enabled) throw new Error("disabled trophy history read");
    return mastery.history;
  }),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, userId: string, key: string, value: unknown) => {
      store.set(keyOf(userId, key), value);
    },
  ),
}));

import { GET, POST } from "@/app/api/v2/me/housing/route";
import { defaultHousingState, HOUSING_SAVE_KEY } from "@/adventure/data/v2/housing";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { ensureUser } from "@/lib/server/ensureUser";
import { readCodexMasteryTrophyHistory } from "@/lib/server/codexMasteryTrophyRepository";

const EQUIPMENT_ID = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;

function request(body?: unknown) {
  return new Request("http://t/api/v2/me/housing", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("housing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    housingGate.enabled = true;
    mastery.enabled = false;
    mastery.history = [];
    vi.mocked(ensureUser).mockResolvedValue("u1");
    store.set(keyOf("u1", "character-profile.v2"), { name: "검은여우" });
    store.set(keyOf("u1", "equipment.v2"), {
      owned: [{ iid: "eq-owned", id: EQUIPMENT_ID }],
      equipped: {},
    });
    store.set(keyOf("u1", "adventure-log.v2"), {
      coopBossKinds: ["mountain_chief"],
    });
    store.set(keyOf("u1", "fishing-codex.v1"), {
      fish: {
        crucian_carp: {
          discovered: true,
          bestSize: 34.5,
          totalCaught: 2,
          firstCaughtAt: 1,
          bestCaughtAt: 2,
        },
      },
    });
  });

  it("returns 404 without authentication or save access while housing is disabled", async () => {
    housingGate.enabled = false;

    const [getResponse, postResponse] = await Promise.all([
      GET(request()),
      POST(request(defaultHousingState())),
    ]);

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(await getResponse.json()).toEqual({ ok: false, error: "not_found" });
    expect(await postResponse.json()).toEqual({ ok: false, error: "not_found" });
    expect(ensureUser).not.toHaveBeenCalled();
    expect(store.has(keyOf("u1", HOUSING_SAVE_KEY))).toBe(false);
  });

  it("requires authentication", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the starter room and only actually owned display choices", async () => {
    const response = await GET(request());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ownerName).toBe("검은여우");
    expect(json.room).toEqual(defaultHousingState());
    expect(json.displayOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "equipment", iid: "eq-owned" }),
        expect.objectContaining({ kind: "fish", fishId: "crucian_carp" }),
        expect.objectContaining({ kind: "boss", bossId: "mountain_chief" }),
      ]),
    );
  });

  it("saves a valid public room with an owned trophy selection", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "boss_trophy"
        ? {
            ...placement,
            display: { kind: "boss" as const, bossId: "mountain_chief" as const },
          }
        : placement,
    );
    const response = await POST(request(room));
    expect(response.status).toBe(200);
    expect(store.get(keyOf("u1", HOUSING_SAVE_KEY))).toEqual(room);
  });

  it("rejects forged display ownership without changing the save", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-forged" },
          }
        : placement,
    );
    const response = await POST(request(room));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("display_not_owned");
    expect(store.has(keyOf("u1", HOUSING_SAVE_KEY))).toBe(false);
  });

  it("returns earned mastery trophy options only while the trophy feature is enabled", async () => {
    mastery.enabled = true;
    mastery.history = [{
      trophyId: "mastery:fish",
      kind: "mastery_category",
      currentTier: "platinum",
      tierAchievedAt: {
        bronze: "2026-01-01T00:00:00.000Z",
        silver: "2026-02-01T00:00:00.000Z",
        gold: "2026-03-01T00:00:00.000Z",
        platinum: "2026-04-01T00:00:00.000Z",
      },
      catalogVersion: 1,
    }];

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.displayOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "masteryTrophy",
        trophyId: "mastery:fish",
        detail: "도감 숙련 · 백금",
      }),
    ]));
  });

  it("saves an earned mastery trophy on the free record shelf", async () => {
    mastery.enabled = true;
    mastery.history = [{
      trophyId: "mastery:fish",
      kind: "mastery_category",
      currentTier: "gold",
      tierAchievedAt: {
        bronze: "2026-01-01T00:00:00.000Z",
        silver: "2026-02-01T00:00:00.000Z",
        gold: "2026-03-01T00:00:00.000Z",
      },
      catalogVersion: 1,
    }];
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "record_shelf"
        ? {
            ...placement,
            masteryTrophy: { trophyId: "mastery:fish" as const },
          }
        : placement,
    );

    const response = await POST(request(room));

    expect(response.status).toBe(200);
    expect(store.get(keyOf("u1", HOUSING_SAVE_KEY))).toEqual(room);
  });

  it("rejects an unearned mastery trophy without changing the save", async () => {
    mastery.enabled = true;
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "record_shelf"
        ? {
            ...placement,
            masteryTrophy: { trophyId: "mastery:overall" as const },
          }
        : placement,
    );

    const response = await POST(request(room));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "mastery_trophy_not_owned",
    });
    expect(store.has(keyOf("u1", HOUSING_SAVE_KEY))).toBe(false);
  });

  it("hides but preserves a stored trophy while disabled and removes it with its placement", async () => {
    const stored = defaultHousingState();
    stored.layout = stored.layout.map((placement) =>
      placement.furnitureId === "record_shelf"
        ? {
            ...placement,
            masteryTrophy: { trophyId: "mastery:overall" as const },
          }
        : placement,
    );
    store.set(keyOf("u1", HOUSING_SAVE_KEY), stored);

    const getResponse = await GET(request());
    const getJson = await getResponse.json();
    expect(getJson.room.layout).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ masteryTrophy: expect.anything() }),
    ]));
    expect(getJson.displayOptions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "masteryTrophy" }),
    ]));

    const moved = getJson.room;
    moved.layout = moved.layout.map((placement: { furnitureId: string }) =>
      placement.furnitureId === "record_shelf"
        ? { ...placement, y: 1 }
        : placement
    );
    expect((await POST(request(moved))).status).toBe(200);
    expect(store.get(keyOf("u1", HOUSING_SAVE_KEY))).toEqual(expect.objectContaining({
      layout: expect.arrayContaining([
        expect.objectContaining({
          furnitureId: "record_shelf",
          y: 1,
          masteryTrophy: { trophyId: "mastery:overall" },
        }),
      ]),
    }));

    const withoutShelf = {
      ...moved,
      layout: moved.layout.filter(
        (placement: { furnitureId: string }) =>
          placement.furnitureId !== "record_shelf",
      ),
    };
    expect((await POST(request(withoutShelf))).status).toBe(200);
    expect(store.get(keyOf("u1", HOUSING_SAVE_KEY))).toEqual(withoutShelf);
    expect(readCodexMasteryTrophyHistory).not.toHaveBeenCalled();
  });
});
