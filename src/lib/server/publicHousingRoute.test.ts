import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, resolved, housingGate, mastery } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  resolved: { userId: "target", displayName: "은빛나무" },
  housingGate: { enabled: true },
  mastery: {
    enabled: false,
    history: [] as Array<Record<string, unknown>>,
  },
}));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "viewer"),
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
    execute: vi.fn(async () => ({
      rows: [
        {
          user_id: resolved.userId,
          display_name: resolved.displayName,
        },
      ],
    })),
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
}));

import { GET } from "@/app/api/v2/player/[name]/housing/route";
import { defaultHousingState } from "@/adventure/data/v2/housing";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readCodexMasteryTrophyHistory } from "@/lib/server/codexMasteryTrophyRepository";

const EQUIPMENT_ID = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;

function get() {
  return GET(new Request("http://t/api/v2/player/x/housing"), {
    params: Promise.resolve({ name: "은빛나무" }),
  });
}

describe("public housing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    housingGate.enabled = true;
    mastery.enabled = false;
    mastery.history = [];
    resolved.userId = "target";
    resolved.displayName = "은빛나무";
    store.set(keyOf("target", "equipment.v2"), {
      owned: [
        { iid: "eq-shown", id: EQUIPMENT_ID },
        { iid: "eq-private", id: EQUIPMENT_ID },
      ],
      equipped: {},
    });
  });

  it("returns 404 before looking up a player while housing is disabled", async () => {
    housingGate.enabled = false;

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
    expect(ensureUser).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("blocks another viewer from a private room", async () => {
    store.set(keyOf("target", "housing.v1"), {
      ...defaultHousingState(),
      isPublic: false,
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("private_room");
  });

  it("returns only equipment that is actually selected for public display", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-shown" },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ownerName).toBe("은빛나무");
    expect(json.displayOptions).toHaveLength(1);
    expect(json.displayOptions[0]).toMatchObject({
      kind: "equipment",
      iid: "eq-shown",
    });
  });

  it("removes a stale display reference after its equipment is gone", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-disposed" },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.displayOptions).toEqual([]);
    expect(json.room.layout.some((placement: { display?: unknown }) => placement.display)).toBe(false);
  });

  it("returns only an earned mastery trophy selected in the public room", async () => {
    mastery.enabled = true;
    mastery.history = [{
      trophyId: "mastery:overall",
      kind: "mastery_overall",
      currentTier: "diamond",
      tierAchievedAt: {
        bronze: "2026-01-01T00:00:00.000Z",
        silver: "2026-02-01T00:00:00.000Z",
        gold: "2026-03-01T00:00:00.000Z",
        platinum: "2026-04-01T00:00:00.000Z",
        diamond: "2026-05-01T00:00:00.000Z",
      },
      catalogVersion: 1,
    }];
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "record_shelf"
        ? {
            ...placement,
            masteryTrophy: { trophyId: "mastery:overall" as const },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.displayOptions).toEqual([{
      kind: "masteryTrophy",
      trophyId: "mastery:overall",
      category: "overall",
      currentTier: "diamond",
      label: "모험왕의 대서",
      detail: "도감 숙련 · 다이아",
    }]);
    expect(json.room.layout).toEqual(expect.arrayContaining([
      expect.objectContaining({
        furnitureId: "record_shelf",
        masteryTrophy: { trophyId: "mastery:overall" },
      }),
    ]));
  });

  it("removes a stale trophy without removing the valid artifact beside it", async () => {
    mastery.enabled = true;
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-shown" },
            masteryTrophy: { trophyId: "mastery:equipment" as const },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();

    const mannequin = json.room.layout.find(
      (placement: { furnitureId: string }) =>
        placement.furnitureId === "equipment_mannequin",
    );
    expect(mannequin).toMatchObject({
      display: { kind: "equipment", iid: "eq-shown" },
    });
    expect(mannequin).not.toHaveProperty("masteryTrophy");
    expect(json.displayOptions).toEqual([
      expect.objectContaining({ kind: "equipment", iid: "eq-shown" }),
    ]);
  });

  it("hides stored mastery trophies without reading history while disabled", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "record_shelf"
        ? {
            ...placement,
            masteryTrophy: { trophyId: "mastery:overall" as const },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.room.layout).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ masteryTrophy: expect.anything() }),
    ]));
    expect(json.displayOptions).toEqual([]);
    expect(readCodexMasteryTrophyHistory).not.toHaveBeenCalled();
  });
});
