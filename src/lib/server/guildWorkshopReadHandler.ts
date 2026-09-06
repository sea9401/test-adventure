import { parseArtisanState } from "@/adventure/data/v2/artisan";
import {
  blacksmithCatalystMaterialForItem,
  blacksmithSpecialtyForSlot,
  blacksmithTechniqueView,
  parseBlacksmithProgressionState,
} from "@/adventure/data/v2/blacksmithSpecialization";
import { spendableGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  GUILD_WORKSHOP_RECIPES,
  GUILD_WORKSHOP_RECIPE_IDS,
  guildWorkshopBaseEquipmentCandidates,
  guildWorkshopBonusFromTotalCrafts,
  guildWorkshopRecipeView,
  parseGuildWorkshopFavoriteRecipeIds,
  parseGuildWorkshopMaterialInventory,
} from "@/adventure/data/v2/guildWorkshop";
import { guildSmithyUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { V2_EQUIPMENT, parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { db } from "@/db";
import { ensureUser } from "./ensureUser";
import { equippedPersonalCraftGoldDiscountPct } from "./equipmentLiberationCraftDiscount";
import {
  artisanView,
  externalAccessView,
  readGuildWorkshopBonus,
  resolveWorkshopAccess,
  workshopRecordsView,
  workshopStatsView,
  type CharacterSaveWithMaterials,
} from "./guildWorkshopAccess";
import { readSave } from "./savesKv";
import { outpostIdFromRequest } from "./settlementBuildingAccess";
import { readGuildSettlement } from "./v2Settlement";

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
    blacksmithProgression,
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
      blacksmithProgression: parseBlacksmithProgressionState(
        craftingRaw.blacksmithProgression,
      ),
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
  const signatureCandidates =
    artisan.blacksmith.level >= 28 && blacksmithProgression.specialty
      ? equipment.owned.flatMap((instance) => {
          const item = V2_EQUIPMENT[instance.id];
          if (
            instance.craftedBy?.userId !== userId ||
            blacksmithSpecialtyForSlot(item.slot) !==
              blacksmithProgression.specialty
          ) {
            return [];
          }
          return [
            {
              iid: instance.iid,
              equipmentId: instance.id,
              itemName: item.name,
              slot: item.slot,
              masterwork: instance.craftedBy.masterwork === true,
              craftQualityLevel: instance.craftQuality?.level ?? 0,
            },
          ];
        })
      : [];
  const craftSpendableGold = Math.max(
    0,
    playerSpendableGold - Math.max(0, Math.floor(access.useFeeGold)),
  );
  const liberationDiscountPct =
    equippedPersonalCraftGoldDiscountPct(equipment);
  return Response.json({
    ok: true,
    hasGuildSmithy: smithyLevel > 0,
    smithyLevel,
    smithyBonus,
    guildBonus,
    resources,
    materials,
    spendableGold: playerSpendableGold,
    liberationDiscountPct,
    artisan,
    blacksmithProgression,
    signatureCandidates,
    workshopStats,
    workshopRecords,
    favoriteRecipeIds,
    externalAccess: externalAccessView(access),
    recipes: GUILD_WORKSHOP_RECIPE_IDS.map((id) => {
      const recipe = GUILD_WORKSHOP_RECIPES[id];
      const item = V2_EQUIPMENT[recipe.equipmentId];
      const techniques = blacksmithTechniqueView({
        level: artisan.blacksmith.level,
        specialty: blacksmithProgression.specialty,
        item,
      });
      const catalystMaterialId = blacksmithCatalystMaterialForItem(item);
      return {
        ...guildWorkshopRecipeView(
          recipe,
          resources,
          artisanState,
          guildBonus,
          smithyLevel,
          materials,
          guildWorkshopBaseEquipmentCandidates(
            equipment.owned,
            equipment.equipped,
            recipe,
          ).length,
          craftSpendableGold,
        ),
        techniques: {
          ...techniques,
          catalyst: techniques.catalystUnlocked
            ? {
                materialId: catalystMaterialId,
                required: 1,
                owned: materials[catalystMaterialId] ?? 0,
              }
            : null,
        },
      };
    }),
  });
}
