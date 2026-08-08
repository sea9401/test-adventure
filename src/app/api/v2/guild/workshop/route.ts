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
  GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
  addGuildWorkshopCraftRecord,
  addGuildWorkshopCraftStat,
  guildWorkshopCraftRecordTitleIds,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopBaseEquipmentCandidates,
  guildWorkshopRecipeMaterialSpendPlan,
  guildWorkshopRecipeGoldCost,
  guildWorkshopRecipeView,
  hasGuildWorkshopRecipeMaterials,
  isGuildWorkshopCraftMode,
  isGuildWorkshopRecipeId,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopMaterialInventory,
  parseGuildWorkshopCraftRecords,
  parseGuildWorkshopFavoriteRecipeIds,
  parseGuildWorkshopStats,
  rollGuildWorkshopEnhance,
  shouldLogGuildWorkshopCraftActivity,
  spendGuildWorkshopBaseEquipment,
  spendGuildWorkshopMaterialsFromPlan,
  spendGuildWorkshopRecipeMaterials,
  type GuildWorkshopBonus,
} from "@/adventure/data/v2/guildWorkshop";
import {
  spendGold,
  spendableGold,
} from "@/adventure/data/v2/coreLoopConfig";
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
  isUnique,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import { mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { getGuildIdByUser } from "@/lib/server/v2EnsureSoloGuild";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import {
  associationFacilityLevel,
  canUseAdventurerAssociation,
  claimWeeklyFacilitySource,
} from "@/lib/server/adventurerAssociation";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";

type CharacterSaveWithMaterials = {
  materials?: unknown;
  gold?: unknown;
  bankedGold?: unknown;
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
  association: boolean,
): Promise<
  | { ok: true; access: SettlementBuildingAccess }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (association) {
    if (!(await canUseAdventurerAssociation(db, userId))) {
      return {
        ok: false,
        status: 403,
        body: { ok: false, error: "association_for_solo_only" },
      };
    }
    const level = await associationFacilityLevel(db, "guild_smithy");
    return {
      ok: true,
      access: {
        outpostId: "association",
        guildId: 0,
        buildingId: "guild_smithy",
        level,
        kind: "member",
        taxRate: 0,
        useFeeGold: 0,
      },
    };
  }
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
    new URL(req.url).searchParams.get("scope") === "association",
  );
  if (!resolved.ok) {
    return Response.json(resolved.body, { status: resolved.status });
  }
  const { access } = resolved;
  const guildId = access.guildId;
  const association = access.outpostId === "association";
  const smithyLevel = access.level;

  const baseGuildBonus = association
    ? guildWorkshopBonusFromTotalCrafts(0)
    : await readGuildWorkshopBonus(guildId);
  const smithyBonus = guildSmithyUpgradeForLevel(Math.max(1, smithyLevel));
  const guildBonus = {
    ...baseGuildBonus,
    qualityChanceBonusPct:
      baseGuildBonus.qualityChanceBonusPct + smithyBonus.qualityChanceBonusPct,
  };
  const {
    resources,
    materials,
    equipment,
    artisan,
    artisanState,
    workshopStats,
    workshopRecords,
    favoriteRecipeIds,
    playerSpendableGold,
  } = await db.transaction(async (tx) => {
    const resources = association ? {} : await readGuildSettlement(tx, guildId);
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
    const equipmentRaw = await readSave<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    return {
      resources,
      materials: parseGuildWorkshopMaterialInventory(charRaw.materials),
      equipment: parseEquipmentSave(equipmentRaw),
      artisan: artisanView(craftingRaw),
      artisanState: parseArtisanState(craftingRaw.artisan),
      workshopStats: workshopStatsView(craftingRaw),
      workshopRecords: workshopRecordsView(craftingRaw),
      favoriteRecipeIds: parseGuildWorkshopFavoriteRecipeIds(
        craftingRaw.workshopFavoriteRecipeIds,
      ),
      playerSpendableGold: spendableGold(
        Math.max(0, Math.floor(Number(charRaw.gold) || 0)),
        Math.max(0, Math.floor(Number(charRaw.bankedGold) || 0)),
      ),
    };
  });
  const craftSpendableGold = Math.max(
    0,
    playerSpendableGold - Math.max(0, Math.floor(access.useFeeGold)),
  );
  return Response.json({
    ok: true,
    hasGuildSmithy: smithyLevel > 0,
    smithyLevel,
    smithyBonus,
    guildBonus,
    resources,
    materials,
    spendableGold: playerSpendableGold,
    artisan,
    workshopStats,
    workshopRecords,
    favoriteRecipeIds,
    externalAccess: externalAccessView(access),
    recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
      guildWorkshopRecipeView(
        GUILD_WORKSHOP_RECIPES[id],
        resources,
        artisanState,
        guildBonus,
        smithyLevel,
        materials,
        guildWorkshopBaseEquipmentCandidates(
          equipment.owned,
          equipment.equipped,
          GUILD_WORKSHOP_RECIPES[id],
        ).length,
        craftSpendableGold,
      ),
    ),
  });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    recipeId?: unknown;
    mode?: unknown;
    outpostId?: unknown;
    useMaterialSubstitution?: unknown;
  };
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
  const useMaterialSubstitution = body.useMaterialSubstitution === true;

  const resolved = await resolveWorkshopAccess(
    userId,
    outpostIdFromRequest(req, body.outpostId),
    new URL(req.url).searchParams.get("scope") === "association",
  );
  if (!resolved.ok) {
    return Response.json(resolved.body, { status: resolved.status });
  }
  const { access } = resolved;
  const guildId = access.guildId;
  const association = access.outpostId === "association";
  const smithyLevel = access.level;
  if (smithyLevel <= 0) {
    return Response.json(
      { ok: false, error: "smithy_required" },
      { status: 403 },
    );
  }
  const baseGuildBonus = association
    ? guildWorkshopBonusFromTotalCrafts(0)
    : await readGuildWorkshopBonus(guildId);
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
    const currentGold = Math.max(0, Math.floor(Number(charRaw.gold) || 0));
    const currentBankedGold = Math.max(
      0,
      Math.floor(Number(charRaw.bankedGold) || 0),
    );
    const externalUseFeeGold = Math.max(
      0,
      Math.floor(Number(access.useFeeGold) || 0),
    );
    const materials = parseGuildWorkshopMaterialInventory(charRaw.materials);
    const materialSpendPlan = guildWorkshopRecipeMaterialSpendPlan(
      materials,
      recipe,
      craftMode,
    );
    const baseCraftGoldCost = guildWorkshopRecipeGoldCost(recipe, craftMode);
    const substitutionGoldCost = useMaterialSubstitution
      ? materialSpendPlan.extraGoldCost
      : 0;
    const craftGoldCost = baseCraftGoldCost + substitutionGoldCost;
    const totalGoldCost = craftGoldCost + externalUseFeeGold;
    const resources = association ? {} : await readGuildSettlement(tx, guildId);
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
    const baseEquipmentSpend = spendGuildWorkshopBaseEquipment(
      parsed.owned,
      parsed.equipped,
      recipe,
    );
    if (!baseEquipmentSpend) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_base_equipment" as const,
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
              guildWorkshopBaseEquipmentCandidates(
                parsed.owned,
                parsed.equipped,
                GUILD_WORKSHOP_RECIPES[id],
              ).length,
            ),
          ),
        },
      };
    }
    const exactMaterialsOk = hasGuildWorkshopRecipeMaterials(
      materials,
      recipe,
      craftMode,
    );
    const selectedMaterialsOk = useMaterialSubstitution
      ? materialSpendPlan.ok
      : exactMaterialsOk;
    if (!selectedMaterialsOk) {
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
              guildWorkshopBaseEquipmentCandidates(
                parsed.owned,
                parsed.equipped,
                GUILD_WORKSHOP_RECIPES[id],
              ).length,
            ),
          ),
        },
      };
    }
    const goldPreflight = spendGold(
      currentGold,
      currentBankedGold,
      totalGoldCost,
    );
    if (!goldPreflight.ok) {
      const playerSpendableGold = spendableGold(
        currentGold,
        currentBankedGold,
      );
      const craftSpendableGold = Math.max(
        0,
        playerSpendableGold - externalUseFeeGold,
      );
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_gold" as const,
          requiredGold: totalGoldCost,
          goldCost: craftGoldCost,
          externalUseFeeGold,
          gold: currentGold,
          bankedGold: currentBankedGold,
          spendableGold: playerSpendableGold,
          resources,
          materials,
          artisan: artisanView(craftingRaw),
          externalAccess: externalAccessView(access),
          recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) =>
            guildWorkshopRecipeView(
              GUILD_WORKSHOP_RECIPES[id],
              resources,
              currentArtisan,
              guildBonus,
              smithyLevel,
              materials,
              guildWorkshopBaseEquipmentCandidates(
                parsed.owned,
                parsed.equipped,
                GUILD_WORKSHOP_RECIPES[id],
              ).length,
              craftSpendableGold,
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
    const craftPayment = spendGold(fee.gold, fee.bankedGold, craftGoldCost);
    if (!craftPayment.ok) {
      throw new Error("guild workshop gold preflight drifted");
    }
    const weeklySource = await claimWeeklyFacilitySource(
      tx,
      userId,
      "guild_smithy",
      association ? "association" : "guild",
      week.key,
    );
    if (!weeklySource.ok) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "weekly_source_conflict" as const,
          selectedSource: weeklySource.selected,
        },
      };
    }
    const paidCharRaw = {
      ...(fee.charSave as CharacterSaveWithMaterials),
      gold: craftPayment.gold,
      bankedGold: craftPayment.bankedGold,
    };
    const nextArtisan = addArtisanXp(
      currentArtisan,
      recipe.profession,
      recipe.artisanXp,
    );
    const nextMaterials = useMaterialSubstitution
      ? spendGuildWorkshopMaterialsFromPlan(materials, materialSpendPlan)
      : spendGuildWorkshopRecipeMaterials(materials, recipe, craftMode);
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
        scoreMultiplier:
          craftMode === "masterwork"
            ? GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT
            : 1,
      },
    );
    const item = V2_EQUIPMENT[recipe.equipmentId];
    const craftedAt = new Date().toISOString();
    const nextWeekly = association
      ? null
      : await incrementGuildWorkshopWeeklyProgress(tx, guildId, {
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
    const nextOwned = [...baseEquipmentSpend.owned, craftedItem];

    await upsertSave(tx, userId, "character.v2", {
      ...paidCharRaw,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    if (isUnique(item)) {
      await recordUniqueEquipmentAcquisitions({
        executor: tx,
        userId,
        evidence: {
          equipmentOwnedAfter: nextOwned,
          equipmentCodexRaw: await readSave(
            tx,
            userId,
            EQUIPMENT_CODEX_KEY,
            {},
          ),
          acquiredIds: [recipe.equipmentId],
        },
      });
    }
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
    if (!association && shouldLogGuildWorkshopCraftActivity(item)) {
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
        usedMaterialSubstitution:
          useMaterialSubstitution && materialSpendPlan.substitutions.length > 0,
        materialSubstitutions: useMaterialSubstitution
          ? materialSpendPlan.substitutions
          : [],
        baseGoldCost: baseCraftGoldCost,
        substitutionGoldCost,
        goldCost: craftGoldCost,
        gold: craftPayment.gold,
        bankedGold: craftPayment.bankedGold,
        spendableGold: spendableGold(
          craftPayment.gold,
          craftPayment.bankedGold,
        ),
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
            guildWorkshopBaseEquipmentCandidates(
              nextOwned,
              parsed.equipped,
              GUILD_WORKSHOP_RECIPES[id],
            ).length,
            Math.max(
              0,
              spendableGold(craftPayment.gold, craftPayment.bankedGold) -
                externalUseFeeGold,
            ),
          ),
        ),
        grantedTitles,
        resources,
        materials: nextMaterials,
        owned: nextOwned,
      },
    };
  });

  if (result.body.ok) {
    recordEconomyEventSoon({
      userId,
      eventType: "sink.guild_workshop.craft_fee",
      goldDelta: -result.body.goldCost,
      itemKind: "equipment",
      itemId: result.body.equipmentId,
      quantity: 1,
      detail: {
        recipeId: result.body.recipeId,
        craftMode: result.body.craftMode,
        externalUseFeeGold: result.body.externalUseFeeGold,
        substitutionGoldCost: result.body.substitutionGoldCost,
        usedMaterialSubstitution: result.body.usedMaterialSubstitution,
      },
    });
  }

  return Response.json(result.body, { status: result.status });
}
