import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordCodexMasteryGameplayBatch, store } = vi.hoisted(() => ({
  recordCodexMasteryGameplayBatch: vi.fn(async () => []),
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-workshop"),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/adventure/data/v2/coreLoopConfig")
  >()),
  V2_EQUIPMENT_LIBERATION: true,
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  canUseAdventurerAssociation: vi.fn(async () => true),
  associationFacilityLevel: vi.fn(async () => 5),
  claimWeeklyFacilitySource: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/server/settlementBuildingAccess", () => ({
  outpostIdFromRequest: vi.fn(() => null),
  resolveOutpostBuildingAccess: vi.fn(),
  applyExternalBuildingUseFeeToCharacter: vi.fn(
    async (_tx: unknown, _access: unknown, charSave: Record<string, unknown>) => ({
      ok: true,
      gold: Math.max(0, Math.floor(Number(charSave.gold) || 0)),
      bankedGold: Math.max(0, Math.floor(Number(charSave.bankedGold) || 0)),
      charSave,
      feeGold: 0,
    }),
  ),
}));
vi.mock("@/lib/server/artisanLeaderboardSnapshots", () => ({
  snapshotStaleArtisanLeaderboards: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => false),
}));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: vi.fn() }));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  recordUniqueEquipmentAcquisitions: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/guildWorkshopWeekly", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/server/guildWorkshopWeekly")
  >();
  return {
    ...actual,
    incrementGuildWorkshopWeeklyProgress: vi.fn(async () => null),
  };
});

import { GET, POST } from "@/app/api/v2/guild/workshop/route";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeGoldCost,
  guildWorkshopRecipeMaterialCost,
} from "@/adventure/data/v2/guildWorkshop";
import { GUILD_WORKSHOP_MATERIAL_ID } from "@/adventure/data/v2/guildWorkshopMaterials";

const RECIPE = GUILD_WORKSHOP_RECIPES.crafted_gale_bow;

function request(body: Record<string, unknown>): Request {
  return new Request("http://test/api/v2/guild/workshop?scope=association", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipeId: RECIPE.id, ...body }),
  });
}

function seed({
  xp = 307_500,
  progression = { specialty: "weapon" },
  catalystCount = 1,
}: {
  xp?: number;
  progression?: Record<string, unknown>;
  catalystCount?: number;
} = {}) {
  const materials = {
    ...(guildWorkshopRecipeMaterialCost(RECIPE) as Record<string, number>),
    [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: catalystCount,
  };
  store.set("character.v2", { gold: 1_000_000, bankedGold: 0, materials });
  store.set("equipment.v2", { owned: [], equipped: {} });
  store.set("crafting.v2", {
    artisan: { blacksmith: { xp, crafts: 100 } },
    blacksmithProgression: progression,
  });
  store.set("character-profile.v2", { name: "전문 장인" });
  return structuredClone(store.get("character.v2"));
}

describe("guild workshop specialization crafting", () => {
  beforeEach(() => {
    store.clear();
    recordCodexMasteryGameplayBatch.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => vi.restoreAllMocks());

  it("exposes progression and recipe-specific technique choices", async () => {
    seed({ xp: 135_000, catalystCount: 3 });

    const response = await GET(
      new Request("http://test/api/v2/guild/workshop?scope=association"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.blacksmithProgression).toEqual({ specialty: "weapon" });
    const recipe = json.recipes.find(
      (entry: { id: string }) => entry.id === RECIPE.id,
    );
    expect(recipe.techniques).toMatchObject({
      eligible: true,
      focusChancePct: 75,
      catalystFocusChancePct: 90,
      catalyst: {
        materialId: GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
        required: 1,
        owned: 3,
      },
    });
    expect(recipe.techniques.optionFocuses.map((entry: { id: string }) => entry.id)).toEqual([
      "weapon_offense",
      "weapon_technique",
    ]);
  });

  it("착용 반지 할인으로 개인 제작 수수료만 낮춘다", async () => {
    seed();
    const baseGoldCost = guildWorkshopRecipeGoldCost(RECIPE);
    store.set("character.v2", {
      ...(store.get("character.v2") as Record<string, unknown>),
      gold: baseGoldCost,
    });
    store.set("equipment.v2", {
      owned: [
        {
          iid: "discount-ring",
          id: "v2_storm_sanctuary_ring",
          liberation: {
            rank: 1,
            lineCount: 1,
            revision: 1,
            options: [
              { id: "personal_craft_gold_discount_pct", level: 20 },
            ],
          },
        },
      ],
      equipped: { ring: "discount-ring" },
    });

    const response = await POST(request({}));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      baseGoldCost,
      goldCost: Math.floor(baseGoldCost * 0.9),
      liberationDiscountPct: 10,
      gold: baseGoldCost - Math.floor(baseGoldCost * 0.9),
    });
  });

  it("exposes only owned self-crafted specialty items as representative candidates", async () => {
    seed({ xp: 240_000 });
    store.set("equipment.v2", {
      owned: [
        {
          iid: "mine",
          id: "v2_crafted_gale_bow",
          craftedBy: {
            userId: "u-workshop",
            profession: "blacksmith",
            level: 28,
            craftedAt: "2026-08-22T00:00:00.000Z",
            specialty: "weapon",
          },
        },
        {
          iid: "other",
          id: "v2_crafted_gale_bow",
          craftedBy: {
            userId: "other-user",
            profession: "blacksmith",
            level: 28,
            craftedAt: "2026-08-22T00:00:00.000Z",
          },
        },
        {
          iid: "wrong-slot",
          id: "v2_storm_wreckage_armor",
          craftedBy: {
            userId: "u-workshop",
            profession: "blacksmith",
            level: 28,
            craftedAt: "2026-08-22T00:00:00.000Z",
          },
        },
      ],
      equipped: {},
    });

    const response = await GET(
      new Request("http://test/api/v2/guild/workshop?scope=association"),
    );
    const json = await response.json();

    expect(json.signatureCandidates).toEqual([
      expect.objectContaining({ iid: "mine", itemName: "질풍궁", slot: "weapon" }),
    ]);
  });

  it("rejects a locked option focus before consuming any resource", async () => {
    const before = seed({ xp: 32_500 });

    const response = await POST(
      request({ optionFocus: "weapon_offense", structure: "balanced" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "technique_locked",
    });
    expect(store.get("character.v2")).toEqual(before);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });

  it("rejects an invalid focus and missing catalyst before payment", async () => {
    const before = seed({ catalystCount: 0 });
    const invalid = await POST(request({ optionFocus: "armor_guard" }));
    expect(invalid.status).toBe(400);
    expect(store.get("character.v2")).toEqual(before);

    const missing = await POST(
      request({ optionFocus: "weapon_offense", useCatalyst: true }),
    );
    expect(missing.status).toBe(409);
    await expect(missing.json()).resolves.toMatchObject({
      ok: false,
      error: "insufficient_catalyst",
    });
    expect(store.get("character.v2")).toEqual(before);
  });

  it("applies eligible controls, consumes the catalyst, and stamps a Lv.28 specialty", async () => {
    seed();

    const response = await POST(
      request({
        optionFocus: "weapon_offense",
        structure: "primary",
        useCatalyst: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      blacksmithControl: {
        optionFocus: "weapon_offense",
        structure: "primary",
        catalystUsed: true,
        catalystPreserved: false,
      },
    });
    const character = store.get("character.v2") as {
      materials: Record<string, number>;
    };
    expect(character.materials[GUILD_WORKSHOP_MATERIAL_ID.refinedIron]).toBe(0);
    const equipment = store.get("equipment.v2") as { owned: object[] };
    expect(equipment.owned).toHaveLength(1);
    expect(equipment.owned[0]).toMatchObject({
      craftedBy: { specialty: "weapon" },
      roll: { weight: 0 },
    });
  });

  it("blocks all new crafting while a final inspection is pending", async () => {
    const before = seed({
      progression: {
        specialty: "weapon",
        pendingInspection: {
          inspectionId: "inspection_pending",
          recipeId: RECIPE.id,
          equipmentId: RECIPE.equipmentId,
          craftQuality: { level: 1, bonusPct: 5 },
          candidates: [
            { power: 10, weight: 0 },
            { power: 11, weight: 0 },
          ],
          craftedBy: {
            userId: "u-workshop",
            profession: "blacksmith",
            level: 30,
            craftedAt: "2026-08-22T00:00:00.000Z",
            masterwork: true,
            specialty: "weapon",
          },
          createdAt: "2026-08-22T00:00:00.000Z",
        },
      },
    });

    const response = await POST(request({}));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "pending_inspection",
    });
    expect(store.get("character.v2")).toEqual(before);
  });

  it("stores two Lv.30 masterwork candidates and accounts for the craft once", async () => {
    seed();
    const character = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...character,
      materials: {
        ...(guildWorkshopRecipeMaterialCost(RECIPE, "masterwork") as Record<
          string,
          number
        >),
        [GUILD_WORKSHOP_MATERIAL_ID.refinedIron]: 1,
      },
    });

    const response = await POST(
      request({
        mode: "masterwork",
        optionFocus: "weapon_offense",
        structure: "extreme",
        useCatalyst: true,
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      iid: null,
      pendingInspection: {
        equipmentId: RECIPE.equipmentId,
        recipeId: RECIPE.id,
        craftQuality: { level: expect.any(Number) },
      },
    });
    expect(json.pendingInspection.candidates).toHaveLength(2);
    expect((store.get("equipment.v2") as { owned: object[] }).owned).toEqual([]);
    expect(store.get("crafting.v2")).toMatchObject({
      artisan: { blacksmith: { xp: 307_500 + RECIPE.artisanXp, crafts: 101 } },
      workshopStats: { totalCrafts: 1 },
      blacksmithProgression: {
        specialty: "weapon",
        pendingInspection: {
          inspectionId: expect.any(String),
          candidates: expect.any(Array),
        },
      },
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledTimes(1);

    const paidCharacter = structuredClone(store.get("character.v2"));
    const retry = await POST(request({ mode: "masterwork" }));
    expect(retry.status).toBe(409);
    expect(store.get("character.v2")).toEqual(paidCharacter);
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledTimes(1);
  });
});
