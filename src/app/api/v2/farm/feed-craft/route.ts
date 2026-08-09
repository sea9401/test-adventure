import { db } from "@/db";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  emptyFarmState,
  hasFarmItems,
  parseFarmState,
  spendFarmItems,
} from "@/adventure/v2/farm";
import { emptyV2SkillsState, parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { LIFE_CRAFTING_RECIPE_BY_ID, recipeMasteryStage } from "@/adventure/v2/lifeCrafting";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { RANCH_FEED_RECIPE } from "@/adventure/v2/ranch";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

const BATCH_LIMITS = [1, 5, 15, 40, 100, 100] as const;

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;
  const body = await req.json().catch(() => null) as { quantity?: unknown } | null;
  const quantity = Math.floor(Number(body?.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const skills = parseV2SkillsState(await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()));
    const farm = parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)), now);
    const workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
    if (!skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID)) return { error: "ranch_locked" as const };
    const craftCount = workshop.crafting.craftCounts[RANCH_FEED_RECIPE.id] ?? 0;
    const batchLimit = BATCH_LIMITS[recipeMasteryStage(craftCount)];
    if (quantity > batchLimit) return { error: "batch_locked" as const, batchLimit };
    const costs = Object.fromEntries(Object.entries(RANCH_FEED_RECIPE.costs).map(([id, amount]) => [id, amount * quantity]));
    if (!hasFarmItems(farm.inventory, costs)) return { error: "not_enough_items" as const };
    const inventory = spendFarmItems(farm.inventory, costs);
    const produced = RANCH_FEED_RECIPE.outputAmount * quantity;
    inventory.compound_feed = (inventory.compound_feed ?? 0) + produced;
    const discovered = new Set(workshop.crafting.discoveredRecipeIds);
    discovered.add(RANCH_FEED_RECIPE.id);
    const crafting = {
      ...workshop.crafting,
      craftCounts: { ...workshop.crafting.craftCounts, [RANCH_FEED_RECIPE.id]: craftCount + quantity },
      discoveredRecipeIds: [...discovered],
      totalCrafts: workshop.crafting.totalCrafts + quantity,
    };
    const nextFarm = { ...farm, inventory };
    const nextWorkshop = { ...workshop, crafting };
    await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextWorkshop);
    const grantedTitles: string[] = [];
    const furnitureTypes = crafting.discoveredRecipeIds.filter((id) => LIFE_CRAFTING_RECIPE_BY_ID.get(id)?.kind === "furniture").length;
    for (const milestone of [
      { ready: crafting.totalCrafts >= 1, id: "life_crafting_first" },
      { ready: crafting.discoveredRecipeIds.length >= 7, id: "life_crafting_macgyver" },
      { ready: furnitureTypes >= 3, id: "life_diy_beginner" },
      { ready: crafting.learnedHiddenRecipeIds.length >= 1, id: "life_blueprint_collector" },
    ]) {
      if (milestone.ready && await grantTitleIfMissingInTx(tx, userId, milestone.id, now)) grantedTitles.push(milestone.id);
    }
    return { ok: true as const, feedCraftResult: { recipeId: RANCH_FEED_RECIPE.id, quantity, produced, grantedTitles }, farm: nextFarm };
  });
  if (!("ok" in result)) {
    return Response.json({ ok: false, ...result }, { status: result.error === "not_enough_items" ? 409 : 400 });
  }
  return Response.json({ ok: true, now, ...result });
}
