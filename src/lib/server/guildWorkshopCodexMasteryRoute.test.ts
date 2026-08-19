import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "./codexMasteryGameplay";

const { recordCodexMasteryGameplayBatch, store } = vi.hoisted(() => ({
  recordCodexMasteryGameplayBatch: vi.fn(
    async (
      _executor: unknown,
      _userId: string,
      _events: readonly CodexMasteryGameplayEvent[],
      _now: Date,
    ) => [],
  ),
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-workshop"),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch,
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
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
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/guildActivityLog", () => ({
  logGuildActivity: vi.fn(async () => undefined),
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

import { POST } from "@/app/api/v2/guild/workshop/route";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeMaterialCost,
} from "@/adventure/data/v2/guildWorkshop";

const RECIPE = GUILD_WORKSHOP_RECIPES.crafted_oathblade;

function request(): Request {
  return new Request("http://test/api/v2/guild/workshop?scope=association", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipeId: RECIPE.id }),
  });
}

function seed(materials: Record<string, number>) {
  store.set("character.v2", { gold: 100_000, bankedGold: 0, materials });
  store.set("equipment.v2", { owned: [], equipped: {} });
  store.set("crafting.v2", {});
  store.set("character-profile.v2", { name: "제작자" });
}

describe("guild workshop codex mastery", () => {
  beforeEach(() => {
    store.clear();
    recordCodexMasteryGameplayBatch.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the exact equipment created by a successful workshop craft", async () => {
    // Break caught: materials and gold are consumed and a crafted instance is owned without craft mastery.
    seed(guildWorkshopRecipeMaterialCost(RECIPE) as Record<string, number>);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      recipeId: RECIPE.id,
      equipmentId: RECIPE.equipmentId,
    });
    expect(recordCodexMasteryGameplayBatch).toHaveBeenCalledWith(
      expect.anything(),
      "u-workshop",
      [{
        category: "equipment",
        entryId: RECIPE.equipmentId,
        amount: 1,
        source: "equipment.craft",
      }],
      expect.any(Date),
    );
  });

  it("does not record when required materials are missing", async () => {
    seed({});

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(recordCodexMasteryGameplayBatch).not.toHaveBeenCalled();
  });
});
