import {
  BLACKSMITH_MASTERWORK_LEVEL,
  addArtisanXp,
  artisanLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import {
  addArtisanWeeklyWorkshopCraft,
  parseArtisanWeeklyWorkshopStats,
} from "@/adventure/data/v2/artisanLeaderboard";
import {
  applyBlacksmithCraftControl,
  blacksmithCatalystMaterialForItem,
  blacksmithTechniqueView,
  isBlacksmithOptionFocusId,
  isBlacksmithStructureId,
  parseBlacksmithProgressionState,
  rollBlacksmithCatalystPreserved,
  rollBlacksmithInspectionCandidates,
  type BlacksmithOptionFocusId,
  type BlacksmithStructureId,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { spendGold, spendableGold } from "@/adventure/data/v2/coreLoopConfig";
import { EQUIPMENT_CODEX_KEY } from "@/adventure/data/v2/equipmentCodex";
import {
  GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
  GUILD_WORKSHOP_RECIPES,
  GUILD_WORKSHOP_RECIPE_IDS,
  addGuildWorkshopCraftRecord,
  addGuildWorkshopCraftStat,
  guildWorkshopBaseEquipmentCandidates,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopCraftRecordTitleIds,
  guildWorkshopRecipeGoldCost,
  guildWorkshopRecipeMaterialSpendPlan,
  guildWorkshopRecipeView,
  hasGuildWorkshopRecipeMaterials,
  isGuildWorkshopCraftMode,
  isGuildWorkshopRecipeId,
  meetsGuildWorkshopRecipeLevel,
  parseGuildWorkshopCraftRecords,
  parseGuildWorkshopMaterialInventory,
  parseGuildWorkshopStats,
  rollGuildWorkshopEnhance,
  shouldLogGuildWorkshopCraftActivity,
  spendGuildWorkshopBaseEquipment,
  spendGuildWorkshopMaterialsFromPlan,
  spendGuildWorkshopRecipeMaterials,
} from "@/adventure/data/v2/guildWorkshop";
import { guildSmithyUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { V2_EQUIPMENT, isUnique, parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { mintEquipInstance, mintRolledEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";
import { db } from "@/db";
import { claimWeeklyFacilitySource } from "@/lib/server/adventurerAssociation";
import { snapshotStaleArtisanLeaderboards } from "@/lib/server/artisanLeaderboardSnapshots";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import { recordEconomyEventSoon } from "@/lib/server/economyLog";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  discountedPersonalCraftGoldCost,
  equippedPersonalCraftGoldDiscountPct,
} from "@/lib/server/equipmentLiberationCraftDiscount";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import {
  artisanView,
  externalAccessView,
  readGuildWorkshopBonus,
  resolveWorkshopAccess,
  type CharacterSaveWithMaterials,
} from "@/lib/server/guildWorkshopAccess";
import {
  currentGuildWorkshopWeek,
  incrementGuildWorkshopWeeklyProgress,
} from "@/lib/server/guildWorkshopWeekly";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import {
  applyExternalBuildingUseFeeToCharacter,
  outpostIdFromRequest,
} from "@/lib/server/settlementBuildingAccess";
import { recordUniqueEquipmentAcquisitions } from "@/lib/server/uniqueEquipmentAchievement";
import { readGuildSettlement } from "@/lib/server/v2Settlement";
export { GET } from "@/lib/server/guildWorkshopReadHandler";
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
    optionFocus?: unknown;
    structure?: unknown;
    useCatalyst?: unknown;
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
  if (body.optionFocus != null && !isBlacksmithOptionFocusId(body.optionFocus)) {
    return Response.json(
      { ok: false, error: "invalid_option_focus" },
      { status: 400 },
    );
  }
  if (body.structure != null && !isBlacksmithStructureId(body.structure)) {
    return Response.json(
      { ok: false, error: "invalid_structure" },
      { status: 400 },
    );
  }
  const optionFocus = body.optionFocus as BlacksmithOptionFocusId | undefined;
  const structure = body.structure as BlacksmithStructureId | undefined;
  const useCatalyst = body.useCatalyst === true;

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
    const undiscountedCraftGoldCost =
      baseCraftGoldCost + substitutionGoldCost;
    const resources = association ? {} : await readGuildSettlement(tx, guildId);
    const equipSave = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "equipment.v2",
      {},
    );
    const liberationDiscountPct =
      equippedPersonalCraftGoldDiscountPct(equipSave);
    const craftGoldCost = discountedPersonalCraftGoldCost(
      undiscountedCraftGoldCost,
      liberationDiscountPct,
    );
    const totalGoldCost = craftGoldCost + externalUseFeeGold;
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
    const item = V2_EQUIPMENT[recipe.equipmentId];
    const blacksmithProgression = parseBlacksmithProgressionState(
      craftingRaw.blacksmithProgression,
    );
    if (blacksmithProgression.pendingInspection) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "pending_inspection" as const,
          blacksmithProgression,
        },
      };
    }
    const techniqueView = blacksmithTechniqueView({
      level: currentBlacksmithLevel,
      specialty: blacksmithProgression.specialty,
      item,
    });
    const requestedControl = optionFocus != null || structure != null || useCatalyst;
    if (requestedControl && !techniqueView.eligible) {
      return {
        status: 403,
        body: { ok: false as const, error: "technique_locked" as const },
      };
    }
    if (
      optionFocus &&
      !techniqueView.optionFocuses.some((focus) => focus.id === optionFocus)
    ) {
      return {
        status: currentBlacksmithLevel < 15 ? 403 : 400,
        body: {
          ok: false as const,
          error:
            currentBlacksmithLevel < 15
              ? ("technique_locked" as const)
              : ("invalid_option_focus" as const),
        },
      };
    }
    if (
      structure &&
      !techniqueView.structures.some((entry) => entry.id === structure)
    ) {
      return {
        status: 403,
        body: { ok: false as const, error: "technique_locked" as const },
      };
    }
    if (structure === "option" && !optionFocus) {
      return {
        status: 400,
        body: { ok: false as const, error: "option_focus_required" as const },
      };
    }
    if (useCatalyst && (!optionFocus || !techniqueView.catalystUnlocked)) {
      return {
        status: currentBlacksmithLevel < 17 ? 403 : 400,
        body: {
          ok: false as const,
          error:
            currentBlacksmithLevel < 17
              ? ("technique_locked" as const)
              : ("option_focus_required" as const),
        },
      };
    }
    if (
      requestedControl &&
      craftMode === "masterwork" &&
      !techniqueView.masterworkTechniquesUnlocked
    ) {
      return {
        status: 403,
        body: { ok: false as const, error: "technique_locked" as const },
      };
    }
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
    const materialsAfterRecipe = useMaterialSubstitution
      ? spendGuildWorkshopMaterialsFromPlan(materials, materialSpendPlan)
      : spendGuildWorkshopRecipeMaterials(materials, recipe, craftMode);
    const catalystMaterialId = blacksmithCatalystMaterialForItem(item);
    if (
      useCatalyst &&
      Math.max(0, materialsAfterRecipe[catalystMaterialId] ?? 0) < 1
    ) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_catalyst" as const,
          catalystMaterialId,
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
          baseGoldCost: undiscountedCraftGoldCost,
          liberationDiscountPct,
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
      association ? undefined : guildId,
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
    const catalystPreserved =
      useCatalyst &&
      rollBlacksmithCatalystPreserved(currentBlacksmithLevel, Math.random);
    const nextMaterials =
      useCatalyst && !catalystPreserved
        ? {
            ...materialsAfterRecipe,
            [catalystMaterialId]: Math.max(
              0,
              (materialsAfterRecipe[catalystMaterialId] ?? 0) - 1,
            ),
          }
        : materialsAfterRecipe;
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
    const shouldCreateInspection =
      craftMode === "masterwork" &&
      currentBlacksmithLevel >= 30 &&
      techniqueView.eligible;
    const inspectionCandidates = shouldCreateInspection
      ? rollBlacksmithInspectionCandidates(
          item,
          { optionFocus, structure, useCatalyst },
          Math.random,
        )
      : null;
    const controlledRoll = !shouldCreateInspection && requestedControl
      ? applyBlacksmithCraftControl(
          item,
          rollItemStats(item, Math.random),
          { optionFocus, structure, useCatalyst },
          Math.random,
        )
      : null;
    const craftedBy = {
      userId,
      ...(crafterName ? { name: crafterName } : {}),
      profession: recipe.profession,
      level: currentBlacksmithLevel,
      craftedAt,
      ...(craftMode === "masterwork" ? { masterwork: true as const } : {}),
      ...(currentBlacksmithLevel >= 28 && techniqueView.eligible
        ? { specialty: blacksmithProgression.specialty }
        : {}),
    };
    if (shouldCreateInspection && (!craftQuality || !inspectionCandidates)) {
      throw new Error("masterwork inspection requires quality and candidates");
    }
    const pendingInspection =
      shouldCreateInspection && craftQuality && inspectionCandidates
        ? {
            inspectionId: `inspection_${crypto.randomUUID()}`,
            recipeId: recipe.id,
            equipmentId: recipe.equipmentId,
            craftQuality,
            candidates: [
              inspectionCandidates[0].roll,
              inspectionCandidates[1].roll,
            ] as const,
            craftedBy,
            createdAt: craftedAt,
          }
        : null;
    const craftedItem = pendingInspection
      ? null
      : {
          ...(controlledRoll
            ? mintEquipInstance(recipe.equipmentId, controlledRoll.roll)
            : mintRolledEquipInstance(recipe.equipmentId)),
          ...(craftQuality ? { craftQuality } : {}),
          craftedBy,
        };
    const nextOwned = craftedItem
      ? [...baseEquipmentSpend.owned, craftedItem]
      : baseEquipmentSpend.owned;
    const nextBlacksmithProgression = pendingInspection
      ? { ...blacksmithProgression, pendingInspection }
      : blacksmithProgression;

    await upsertSave(tx, userId, "character.v2", {
      ...paidCharRaw,
      materials: nextMaterials,
    });
    await upsertSave(tx, userId, "equipment.v2", {
      owned: nextOwned,
      equipped: parsed.equipped,
    });
    if (craftedItem && isUnique(item)) {
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
      blacksmithProgression: nextBlacksmithProgression,
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
    await recordCodexMasteryGameplayBatch(
      tx,
      userId,
      [{
        category: "equipment",
        entryId: recipe.equipmentId,
        amount: 1,
        source: "equipment.craft",
      }],
      new Date(craftedAt),
    );

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
        iid: craftedItem?.iid ?? null,
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
        baseGoldCost: undiscountedCraftGoldCost,
        recipeGoldCost: baseCraftGoldCost,
        substitutionGoldCost,
        goldCost: craftGoldCost,
        liberationDiscountPct,
        gold: craftPayment.gold,
        bankedGold: craftPayment.bankedGold,
        spendableGold: spendableGold(
          craftPayment.gold,
          craftPayment.bankedGold,
        ),
        smithyLevel,
        smithyBonus,
        blacksmithProgression: nextBlacksmithProgression,
        pendingInspection,
        blacksmithControl: requestedControl
          ? {
              optionFocus: optionFocus ?? null,
              structure: structure ?? null,
              focusApplied: controlledRoll?.focusApplied ?? false,
              catalystUsed: useCatalyst,
              catalystMaterialId: useCatalyst ? catalystMaterialId : null,
              catalystPreserved,
            }
          : null,
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
