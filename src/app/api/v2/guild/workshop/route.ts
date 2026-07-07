import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import {
  currentGuildWorkshopWeek,
  incrementGuildWorkshopWeeklyProgress,
} from "@/lib/server/guildWorkshopWeekly";
import { snapshotStaleArtisanLeaderboards } from "@/lib/server/artisanLeaderboardSnapshots";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { guildSmithyUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { readGuildSmithyLevel } from "@/lib/server/guildFacilities";
import {
  applyExternalBuildingUseFeeToCharacter,
  outpostIdFromRequest,
  resolveOutpostBuildingAccess,
  type SettlementBuildingAccess,
} from "@/lib/server/settlementBuildingAccess";
import { readGuildSettlement } from "@/lib/server/v2Settlement";
import {
  GUILD_WORKSHOP_RECIPE_IDS,
  GUILD_WORKSHOP_RECIPES,
  addGuildWorkshopCraftRecord,
  addGuildWorkshopCraftStat,
  guildWorkshopCraftRecordTitleIds,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopRecipeView,
  hasGuildWorkshopRecipeMaterials,
  isGuildWorkshopCraftMode,
  isGuildWorkshopRecipeId,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopMaterialInventory,
  parseGuildWorkshopCraftRecords,
  parseGuildWorkshopStats,
  rollGuildWorkshopEnhance,
  spendGuildWorkshopRecipeMaterials,
  type GuildWorkshopBonus,
} from "@/adventure/data/v2/guildWorkshop";
import {
  ARTISAN_PROFESSION_NAME,
  BLACKSMITH_MASTERWORK_LEVEL,
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
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";

type CharacterSaveWithMaterials = {
  materials?: unknown;
  [key: string]: unknown;
};

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

async function resolveWorkshopAccess(
  userId: string,
  outpostId: string | null,
): Promise<
  | { ok: true; access: SettlementBuildingAccess }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (outpostId) {
    const result = await db.transaction((tx) =>
      resolveOutpostBuildingAccess(tx, userId, outpostId, "guild_smithy"),
    );
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        body: {
          ok: false,
          error:
            result.error === "building_required"
              ? "smithy_required"
              : result.error,
        },
      };
    }
    return { ok: true, access: result.access };
  }

  const guildId = await getGuildIdByUser(userId);
  if (guildId == null) {
    return {
      ok: false,
      status: 403,
      body: { ok: false, error: "no_guild" },
    };
  }
  const level = await readGuildSmithyLevel(db, guildId);
  return {
    ok: true,
    access: {
      outpostId: "",
      guildId,
      buildingId: "guild_smithy",
      level,
      kind: "member",
      taxRate: 0,
      useFeeGold: 0,
    },
  };
}

function externalAccessView(access: SettlementBuildingAccess) {
  return access.kind === "external"
    ? {
        kind: access.kind,
        outpostId: access.outpostId,
        guildId: access.guildId,
        taxRate: access.taxRate,
        useFeeGold: access.useFeeGold,
      }
    : null;
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

function workshopRecordsView(rawCrafting: unknown) {
  const craft =
    rawCrafting != null &&
    typeof rawCrafting === "object" &&
    !Array.isArray(rawCrafting)
      ? (rawCrafting as Record<string, unknown>)
      : {};
  return parseGuildWorkshopCraftRecords(craft.workshopRecords);
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const resolved = await resolveWorkshopAccess(
    userId,
    outpostIdFromRequest(req),
  );
  if (!resolved.ok) {
    return Response.json(resolved.body, { status: resolved.status });
  }
  const { access } = resolved;
  const guildId = access.guildId;
  const smithyLevel = access.level;

  const baseGuildBonus = await readGuildWorkshopBonus(guildId);
  const smithyBonus = guildSmithyUpgradeForLevel(Math.max(1, smithyLevel));
  const guildBonus = {
    ...baseGuildBonus,
    qualityChanceBonusPct:
      baseGuildBonus.qualityChanceBonusPct + smithyBonus.qualityChanceBonusPct,
  };
  const {
    resources,
    materials,
    artisan,
    artisanState,
    workshopStats,
    workshopRecords,
  } = await db.transaction(async (tx) => {
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
      workshopRecords: workshopRecordsView(craftingRaw),
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
    workshopRecords,
    externalAccess: externalAccessView(access),
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

  let body: { recipeId?: unknown; mode?: unknown; outpostId?: unknown };
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
  const craftMode = isGuildWorkshopCraftMode(body.mode) ? body.mode : "normal";

  const resolved = await resolveWorkshopAccess(
    userId,
    outpostIdFromRequest(req, body.outpostId),
  );
  if (!resolved.ok) {
    return Response.json(resolved.body, { status: resolved.status });
  }
  const { access } = resolved;
  const guildId = access.guildId;
  const smithyLevel = access.level;
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
    const resources = await readGuildSettlement(tx, guildId);
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
    const currentBlacksmithLevel = artisanLevel(currentArtisan.blacksmith);
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
    if (
      craftMode === "masterwork" &&
      currentBlacksmithLevel < BLACKSMITH_MASTERWORK_LEVEL
    ) {
      return {
        status: 403,
        body: {
          ok: false as const,
          error: "masterwork_locked" as const,
          requiredArtisanLevel: BLACKSMITH_MASTERWORK_LEVEL,
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
    if (!hasGuildWorkshopRecipeMaterials(materials, recipe, craftMode)) {
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
    const fee = await applyExternalBuildingUseFeeToCharacter(tx, access, charRaw);
    if (!fee.ok) {
      return {
        status: fee.status,
        body: {
          ok: false as const,
          error: fee.error,
          requiredGold: fee.requiredGold,
          externalAccess: externalAccessView(access),
        },
      };
    }
    const paidCharRaw = fee.charSave as CharacterSaveWithMaterials;
    const nextArtisan = addArtisanXp(
      currentArtisan,
      recipe.profession,
      recipe.artisanXp,
    );
    const nextMaterials = spendGuildWorkshopRecipeMaterials(
      materials,
      recipe,
      craftMode,
    );
    const craftQuality = rollGuildWorkshopEnhance(
      currentArtisan,
      recipe,
      Math.random,
      guildBonus,
      craftMode,
    );
    const nextWorkshopStats = addGuildWorkshopCraftStat(
      parseGuildWorkshopStats(craftingRaw.workshopStats),
      recipe.id,
      Boolean(craftQuality),
    );
    const nextWeeklyWorkshopStats = addArtisanWeeklyWorkshopCraft(
      parseArtisanWeeklyWorkshopStats(craftingRaw.weeklyWorkshopStats, week.key),
      {
        qualityCrafted: Boolean(craftQuality),
        xp: recipe.artisanXp,
      },
    );
    const item = V2_EQUIPMENT[recipe.equipmentId];
    const craftedAt = new Date().toISOString();
    const nextWeekly = await incrementGuildWorkshopWeeklyProgress(tx, guildId, {
      qualityCrafted: Boolean(craftQuality),
      slot: item.slot,
      craftOnly: item.craftOnly === true,
      masterwork: craftMode === "masterwork",
      tier: item.tier,
    });
    const crafterName = profile?.name?.trim() || undefined;
    const craftedItem = {
      ...mintRolledEquipInstance(recipe.equipmentId),
      ...(craftQuality ? { craftQuality } : {}),
      craftedBy: {
        userId,
        ...(crafterName ? { name: crafterName } : {}),
        profession: recipe.profession,
        level: currentBlacksmithLevel,
        craftedAt,
        ...(craftMode === "masterwork" ? { masterwork: true } : {}),
      },
    };
    const nextOwned = [...parsed.owned, craftedItem];

    await upsertSave(tx, userId, "character.v2", {
      ...paidCharRaw,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    const nextWorkshopRecords = addGuildWorkshopCraftRecord(
      parseGuildWorkshopCraftRecords(craftingRaw.workshopRecords),
      {
        recipeId: recipe.id,
        item,
        craftQualityLevel: craftQuality?.level ?? 0,
        masterwork: craftMode === "masterwork",
        craftedAt,
      },
    );

    await upsertSave(tx, userId, "crafting.v2", {
      ...craftingRaw,
      artisan: nextArtisan,
      workshopStats: nextWorkshopStats,
      workshopRecords: nextWorkshopRecords,
      weeklyWorkshopStats: nextWeeklyWorkshopStats,
    });
    if (item.craftOnly) {
      await logGuildActivity(tx, {
        guildId,
        type: "workshop_craft_only",
        actorUserId: userId,
        meta: {
          itemName: item.name,
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
    for (const titleId of guildWorkshopCraftRecordTitleIds(nextWorkshopRecords)) {
      if (await grantTitleIfMissingInTx(tx, userId, titleId, obtainedAt)) {
        grantedTitles.push(titleId);
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
        craftMode,
        equipmentId: recipe.equipmentId,
        iid: craftedItem.iid,
        craftQuality: craftQuality ?? null,
        artisanXpGained: recipe.artisanXp,
        artisan: artisanView({ ...craftingRaw, artisan: nextArtisan }),
        workshopStats: nextWorkshopStats,
        workshopRecords: nextWorkshopRecords,
        weeklyState: nextWeekly,
        externalAccess: externalAccessView(access),
        externalUseFeeGold: fee.feeGold,
        smithyLevel,
        smithyBonus,
        guildBonus: nextGuildBonus,
        recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
          guildWorkshopRecipeView(
            GUILD_WORKSHOP_RECIPES[id],
            resources,
            nextArtisan,
            nextGuildBonus,
            smithyLevel,
            nextMaterials,
          ),
        ),
        grantedTitles,
        resources,
        materials: nextMaterials,
        owned: nextOwned,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
