import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, outpostVillages, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  currentGuildWorkshopWeek,
  incrementGuildWorkshopWeeklyProgress,
} from "@/lib/server/guildWorkshopWeekly";
import { snapshotStaleArtisanLeaderboards } from "@/lib/server/artisanLeaderboardSnapshots";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  guildSmithyUpgradeForLevel,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
} from "@/adventure/data/v2/settlement";
import {
  lockGuildSettlement,
  readGuildSettlement,
  upsertGuildSettlement,
} from "@/lib/server/v2Settlement";
import {
  GUILD_WORKSHOP_RECIPE_IDS,
  GUILD_WORKSHOP_RECIPES,
  addGuildWorkshopCraftStat,
  canAffordGuildWorkshopRecipe,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopRecipeView,
  hasGuildWorkshopRecipeMaterials,
  isGuildWorkshopRecipeId,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopMaterialInventory,
  parseGuildWorkshopStats,
  rollGuildWorkshopEnhance,
  spendGuildWorkshopRecipeCost,
  spendGuildWorkshopRecipeMaterials,
  type GuildWorkshopBonus,
} from "@/adventure/data/v2/guildWorkshop";
import {
  ARTISAN_PROFESSION_NAME,
  addArtisanXp,
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import {
  addArtisanWeeklyWorkshopCraft,
  parseArtisanWeeklyWorkshopStats,
} from "@/adventure/data/v2/artisanLeaderboard";
import {
  V2_EQUIPMENT,
  genEquipIid,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";

type CharacterSaveWithMaterials = {
  materials?: unknown;
  [key: string]: unknown;
};

async function getGuildIdForUser(userId: string): Promise<number | null> {
  const row = (
    await db
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  return row?.guildId ?? null;
}

function guildSmithyLevelFromBuildings(buildings: unknown): number {
  if (buildings == null || typeof buildings !== "object" || Array.isArray(buildings)) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === "guild_smithy") {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
}

async function guildSmithyLevel(guildId: number): Promise<number> {
  const rows = await db
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (max, row) => Math.max(max, guildSmithyLevelFromBuildings(row.buildings)),
    0,
  );
}

async function readGuildWorkshopBonus(
  guildId: number,
  extraCrafts = 0,
): Promise<GuildWorkshopBonus> {
  const members = await db
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return guildWorkshopBonusFromTotalCrafts(extraCrafts);
  }
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(
      and(inArray(savesKv.userId, memberIds), eq(savesKv.key, "crafting.v2")),
    );
  const totalCrafts =
    rows.reduce((sum, row) => {
      const value = (row.value ?? null) as {
        workshopStats?: unknown;
      } | null;
      return sum + parseGuildWorkshopStats(value?.workshopStats).totalCrafts;
    }, 0) + extraCrafts;
  return guildWorkshopBonusFromTotalCrafts(totalCrafts);
}

function artisanView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  const artisan = parseArtisanState(craft.artisan);
  const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
  return {
    blacksmith: {
      name: ARTISAN_PROFESSION_NAME.blacksmith,
      xp: blacksmith.xp,
      crafts: blacksmith.crafts,
      level: artisanLevel(blacksmith),
      xpIntoLevel: artisanXpIntoLevel(blacksmith),
      xpForNext: artisanXpForNextLevel(blacksmith),
    },
  };
}

function workshopStatsView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  return parseGuildWorkshopStats(craft.workshopStats);
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const guildId = await getGuildIdForUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }

  const [smithyLevel, baseGuildBonus] = await Promise.all([
    guildSmithyLevel(guildId),
    readGuildWorkshopBonus(guildId),
  ]);
  const smithyBonus = guildSmithyUpgradeForLevel(Math.max(1, smithyLevel));
  const guildBonus = {
    ...baseGuildBonus,
    qualityChanceBonusPct:
      baseGuildBonus.qualityChanceBonusPct + smithyBonus.qualityChanceBonusPct,
  };
  const { resources, materials, artisan, artisanState, workshopStats } =
    await db.transaction(async (tx) => {
    const resources = await readGuildSettlement(tx, guildId);
    const charRaw = await readSave<CharacterSaveWithMaterials>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const craftingRaw = await readSave<Record<string, unknown>>(
      tx,
      userId,
      "crafting.v2",
      {},
    );
    return {
      resources,
      materials: parseGuildWorkshopMaterialInventory(charRaw.materials),
      artisan: artisanView(craftingRaw),
      artisanState: parseArtisanState(craftingRaw.artisan),
      workshopStats: workshopStatsView(craftingRaw),
    };
  });
  return Response.json({
    ok: true,
    hasGuildSmithy: smithyLevel > 0,
    smithyLevel,
    smithyBonus,
    guildBonus,
    resources,
    materials,
    artisan,
    workshopStats,
    recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES[id],
        resources,
        artisanState,
        guildBonus,
        smithyLevel,
        materials,
      ),
    ),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { recipeId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!isGuildWorkshopRecipeId(body.recipeId)) {
    return Response.json(
      { ok: false, error: "invalid_recipe" },
      { status: 400 },
    );
  }
  const recipe = GUILD_WORKSHOP_RECIPES[body.recipeId];

  const guildId = await getGuildIdForUser(userId);
  if (guildId == null) {
    return Response.json({ ok: false, error: "no_guild" }, { status: 403 });
  }
  const smithyLevel = await guildSmithyLevel(guildId);
  if (smithyLevel <= 0) {
    return Response.json(
      { ok: false, error: "smithy_required" },
      { status: 403 },
    );
  }
  const baseGuildBonus = await readGuildWorkshopBonus(guildId);
  const smithyBonus = guildSmithyUpgradeForLevel(smithyLevel);
  const guildBonus = {
    ...baseGuildBonus,
    qualityChanceBonusPct:
      baseGuildBonus.qualityChanceBonusPct + smithyBonus.qualityChanceBonusPct,
  };
  const week = currentGuildWorkshopWeek();
  await snapshotStaleArtisanLeaderboards(week.key);

  const result = await db.transaction(async (tx) => {
    const charRaw = await lockSaveForUpdate<CharacterSaveWithMaterials>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials = parseGuildWorkshopMaterialInventory(charRaw.materials);
    const resources = await lockGuildSettlement(tx, guildId);
    const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const profile = await readSave<{ name?: string } | null>(
      tx,
      userId,
      "character-profile.v2",
      null,
    );
    const craftingRaw = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "crafting.v2",
      {},
    );
    const parsed = parseEquipmentSave(equipSave);
    const currentArtisan = parseArtisanState(craftingRaw.artisan);
    if (!meetsGuildWorkshopRecipeLevel(currentArtisan, recipe)) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "insufficient_artisan_level" as const,
          requiredArtisanLevel: recipe.requiredArtisanLevel,
          artisan: artisanView(craftingRaw),
        },
      };
    }
    if (smithyLevel < Math.max(1, recipe.requiredSmithyLevel ?? 1)) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "insufficient_smithy_level" as const,
          requiredSmithyLevel: recipe.requiredSmithyLevel ?? 1,
          smithyLevel,
        },
      };
    }
    if (!canAffordGuildWorkshopRecipe(resources, recipe)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_resources" as const,
          resources,
          materials,
          artisan: artisanView(craftingRaw),
          recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
            guildWorkshopRecipeView(
              GUILD_WORKSHOP_RECIPES[id],
              resources,
              currentArtisan,
              guildBonus,
              smithyLevel,
              materials,
            ),
          ),
        },
      };
    }
    if (!hasGuildWorkshopRecipeMaterials(materials, recipe)) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_materials" as const,
          resources,
          materials,
          artisan: artisanView(craftingRaw),
          recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
            guildWorkshopRecipeView(
              GUILD_WORKSHOP_RECIPES[id],
              resources,
              currentArtisan,
              guildBonus,
              smithyLevel,
              materials,
            ),
          ),
        },
      };
    }
    const nextArtisan = addArtisanXp(
      currentArtisan,
      recipe.profession,
      recipe.artisanXp,
    );
    const nextResources = spendGuildWorkshopRecipeCost(resources, recipe);
    const nextMaterials = spendGuildWorkshopRecipeMaterials(materials, recipe);
    const craftedEnhance = rollGuildWorkshopEnhance(
      currentArtisan,
      recipe,
      Math.random,
      guildBonus,
    );
    const nextWorkshopStats = addGuildWorkshopCraftStat(
      parseGuildWorkshopStats(craftingRaw.workshopStats),
      recipe.id,
      Boolean(craftedEnhance),
    );
    const nextWeeklyWorkshopStats = addArtisanWeeklyWorkshopCraft(
      parseArtisanWeeklyWorkshopStats(craftingRaw.weeklyWorkshopStats, week.key),
      {
        qualityCrafted: Boolean(craftedEnhance),
        xp: recipe.artisanXp,
      },
    );
    const nextWeekly = await incrementGuildWorkshopWeeklyProgress(
      tx,
      guildId,
      Boolean(craftedEnhance),
    );
    const crafterName = profile?.name?.trim() || undefined;
    const craftedItem = {
      iid: genEquipIid(),
      id: recipe.equipmentId,
      ...(craftedEnhance ? { enhance: craftedEnhance } : {}),
      craftedBy: {
        userId,
        ...(crafterName ? { name: crafterName } : {}),
        profession: recipe.profession,
        level: artisanLevel(currentArtisan[recipe.profession]),
        craftedAt: new Date().toISOString(),
      },
    };
    const nextOwned = [
      ...parsed.owned,
      craftedItem,
    ];

    await upsertGuildSettlement(tx, guildId, nextResources);
    await upsertSave(tx, userId, "character.v2", {
      ...charRaw,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      artisan: nextArtisan,
      workshopStats: nextWorkshopStats,
      weeklyWorkshopStats: nextWeeklyWorkshopStats,
    });
    if (V2_EQUIPMENT[recipe.equipmentId]?.craftOnly) {
      await logGuildActivity(tx, {
        guildId,
        type: "workshop_craft_only",
        actorUserId: userId,
        meta: {
          itemName: V2_EQUIPMENT[recipe.equipmentId]?.name,
        },
      });
    }

    const obtainedAt = Date.now();
    const grantedTitles: string[] = [];
    if (artisanLevel(nextArtisan.blacksmith) >= 2) {
      if (
        await grantTitleIfMissingInTx(
          tx,
          userId,
          "artisan_blacksmith_apprentice",
          obtainedAt,
        )
      ) {
        grantedTitles.push("artisan_blacksmith_apprentice");
      }
    }
    if (nextWorkshopStats.totalCrafts >= 30) {
      if (
        await grantTitleIfMissingInTx(
          tx,
          userId,
          "artisan_guild_crafter",
          obtainedAt,
        )
      ) {
        grantedTitles.push("artisan_guild_crafter");
      }
    }
    if (nextWorkshopStats.qualityCrafts >= 5) {
      if (
        await grantTitleIfMissingInTx(
          tx,
          userId,
          "artisan_masterwork",
          obtainedAt,
        )
      ) {
        grantedTitles.push("artisan_masterwork");
      }
    }
    const baseNextGuildBonus = guildWorkshopBonusFromTotalCrafts(
      baseGuildBonus.totalCrafts + 1,
    );
    const nextGuildBonus = {
      ...baseNextGuildBonus,
      qualityChanceBonusPct:
        baseNextGuildBonus.qualityChanceBonusPct +
        smithyBonus.qualityChanceBonusPct,
    };

    return {
      status: 200,
      body: {
        ok: true as const,
        recipeId: recipe.id,
        equipmentId: recipe.equipmentId,
        iid: craftedItem.iid,
        enhance: craftedEnhance ?? null,
        artisanXpGained: recipe.artisanXp,
        artisan: artisanView({ ...craftingRaw, artisan: nextArtisan }),
        workshopStats: nextWorkshopStats,
        weeklyState: nextWeekly,
        smithyLevel,
        smithyBonus,
        guildBonus: nextGuildBonus,
        recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
          guildWorkshopRecipeView(
            GUILD_WORKSHOP_RECIPES[id],
            nextResources,
            nextArtisan,
            nextGuildBonus,
            smithyLevel,
            nextMaterials,
          ),
        ),
        grantedTitles,
        resources: nextResources,
        materials: nextMaterials,
        owned: nextOwned,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
