import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  addCumLevel,
  addJobCumLevel,
  parseProficiencyForChar,
} from "@/adventure/data/v2/proficiency";
import {
  V2_JOB_CATALOG,
  isCookingJobId,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  hasFarmItems,
  normalizeFarmForDay,
  parseFarmState,
  spendFarmItems,
  type FarmItemInventory,
} from "@/adventure/v2/farm";
import {
  FISHING_CATCH_ITEMS,
  FISHING_STOCK_KEY,
  emptyFishingStock,
  parseFishingStock,
  spendFishingCatchItem,
} from "@/adventure/v2/fishingStock";
import {
  COOKING_RECIPE_BY_ID,
  COOKING_RECIPES,
  COOKING_SAVE_KEY,
  addCookingFood,
  adjustedCookingXp,
  cookingFoodId,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  cookingOrders,
  cookingQuality,
  emptyCookingState,
  parseCookingState,
  type CookingAction,
} from "@/adventure/v2/cooking";

type CharacterSave = Record<string, unknown> & {
  gold?: number;
  class?: unknown;
  level?: number;
};

type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
};

function currentCookingJob(char: CharacterSave) {
  const cls = parseV2Class(char.class);
  const jobId = jobIdFromLegacy(
    cls,
    typeof char.specChoice === "string" ? char.specChoice : null,
  );
  const definition = V2_JOB_CATALOG[jobId];
  return {
    cls,
    jobId: isCookingJobId(jobId) ? jobId : null,
    tier: isCookingJobId(jobId) ? definition?.tier ?? 0 : 0,
  };
}

function cookingView(userId: string, now: number, values: {
  cookingRaw: unknown;
  farmRaw: unknown;
  fishingRaw: unknown;
  character: CharacterSave;
}) {
  const cooking = parseCookingState(values.cookingRaw, now);
  const farm = normalizeFarmForDay(parseFarmState(values.farmRaw), now);
  const fishing = parseFishingStock(values.fishingRaw);
  const level = cookingLevelForXp(cooking.xp);
  const job = currentCookingJob(values.character);
  return {
    ok: true,
    now,
    cooking,
    level,
    currentLevelXp: cookingLevelXpThreshold(level),
    nextLevelXp: level >= 50 ? null : cookingLevelXpThreshold(level + 1),
    recipes: COOKING_RECIPES,
    orders: cookingOrders(userId, cooking),
    farmItems: farm.inventory,
    farmReputation: farm.stats.reputation,
    fishingItems: fishing.items,
    fishingItemDefinitions: FISHING_CATCH_ITEMS,
    cookingJobId: job.jobId,
    cookingJobName: job.jobId ? V2_JOB_CATALOG[job.jobId]?.name ?? job.jobId : null,
    cookingJobTier: job.tier,
  };
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:cooking:get",
    userLimit: 120,
    ipLimit: 600,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const now = Date.now();
  const [cookingRaw, farmRaw, fishingRaw, character] = await Promise.all([
    readSave(db, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    readSave<CharacterSave>(db, userId, "character.v2", {}),
  ]);
  return Response.json(cookingView(userId, now, { cookingRaw, farmRaw, fishingRaw, character }));
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:cooking:post",
    userLimit: 40,
    ipLimit: 240,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as {
    recipeId?: unknown;
    action?: unknown;
    useRare?: unknown;
    quantity?: unknown;
  } | null;
  const recipeId = typeof body?.recipeId === "string" ? body.recipeId : "";
  const action: CookingAction | null =
    body?.action === "cook" || body?.action === "order" ? body.action : null;
  const useRare = body?.useRare === true;
  const requestedQuantity = Math.max(1, Math.min(20, Math.floor(Number(body?.quantity) || 1)));
  const quantity = action === "order" ? 1 : requestedQuantity;
  const recipe = COOKING_RECIPE_BY_ID.get(recipeId);
  if (!recipe || !action) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  try {
    const result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
      const farm = normalizeFarmForDay(
        parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now))),
        now,
      );
      let fishing = parseFishingStock(
        await lockSaveForUpdate(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()),
      );
      let cooking = parseCookingState(
        await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
        now,
      );
      const inventory = await lockSaveForUpdate<InventorySave>(
        tx,
        userId,
        "inventory.v2",
        {},
      );
      const level = cookingLevelForXp(cooking.xp);
      if (level < recipe.requiredLevel) throw new Error("recipe_locked");

      const job = currentCookingJob(character);
      const farmRequirements: FarmItemInventory = Object.fromEntries(
        Object.entries(recipe.farmIngredients).map(([id, count]) => [
          id,
          (job.tier >= 4 ? Math.max(1, Math.ceil((count ?? 0) * 0.9)) : count ?? 0) * quantity,
        ]),
      );
      const usedRare = Boolean(
        action === "cook" && useRare && recipe.optionalRareItemId,
      );
      if (usedRare && recipe.optionalRareItemId) farmRequirements[recipe.optionalRareItemId] = quantity;
      if (!hasFarmItems(farm.inventory, farmRequirements)) throw new Error("not_enough_farm_items");

      for (const [itemId, quantity] of Object.entries(recipe.fishingIngredients ?? {})) {
        const next = spendFishingCatchItem(
          fishing,
          itemId as keyof typeof FISHING_CATCH_ITEMS,
          (quantity ?? 0) * (action === "order" ? 1 : requestedQuantity),
        );
        if (!next) throw new Error("not_enough_fishing_items");
        fishing = next;
      }

      const order = action === "order"
        ? cookingOrders(userId, cooking).find(
            (entry) => entry.recipeId === recipe.id && !cooking.daily.completedOrderIds.includes(entry.id),
          )
        : null;
      if (action === "order" && !order) throw new Error("order_unavailable");

      const quality = cookingQuality({ cookingJobTier: job.tier, usedRare });
      const baseXp = adjustedCookingXp(recipe.requiredLevel, level, recipe.xp);
      const earnedXp = Math.max(
        1,
        Math.floor((baseXp * quantity + (order?.bonusXp ?? 0)) * (job.tier >= 2 ? 1.1 : 1)),
      );
      cooking = {
        ...cooking,
        xp: cooking.xp + earnedXp,
        discoveredRecipeIds: Array.from(new Set([...cooking.discoveredRecipeIds, recipe.id])),
        daily: {
          ...cooking.daily,
          completedOrderIds: order
            ? [...cooking.daily.completedOrderIds, order.id]
            : cooking.daily.completedOrderIds,
        },
      };
      const nextFarm = {
        ...farm,
        inventory: spendFarmItems(farm.inventory, farmRequirements),
        stats: {
          ...farm.stats,
          reputation: farm.stats.reputation + (order?.rewardReputation ?? 0),
        },
      };

      const nextCharacter: CharacterSave = {
        ...character,
        gold: Math.max(0, Math.floor(Number(character.gold) || 0)) + (order?.rewardGold ?? 0),
      };
      const foodId = action === "cook"
        ? cookingFoodId({
            recipeId: recipe.id,
            quality,
            usedRare,
            extended: job.tier >= 5,
          })
        : null;
      const nextInventory = foodId
        ? {
            ...inventory,
            cookingFoods: addCookingFood(
              inventory.cookingFoods,
              foodId,
              quantity,
            ),
          }
        : inventory;

      await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
      await upsertSave(tx, userId, FISHING_STOCK_KEY, fishing);
      await upsertSave(tx, userId, COOKING_SAVE_KEY, cooking);
      await upsertSave(tx, userId, "character.v2", nextCharacter);
      if (foodId) {
        await upsertSave(tx, userId, "inventory.v2", nextInventory);
      }

      let masteryGained = 0;
      let masteryAfter: number | null = null;
      if (job.jobId) {
        let proficiency = parseProficiencyForChar(
          await lockSaveForUpdate(tx, userId, "proficiency.v2", {}),
          character,
        );
        masteryGained = earnedXp;
        proficiency = addCumLevel(proficiency, tier1ClassOf(job.cls), masteryGained);
        proficiency = addJobCumLevel(proficiency, job.jobId, masteryGained);
        masteryAfter = proficiency.jobCumLevel?.[job.jobId] ?? 0;
        await upsertSave(tx, userId, "proficiency.v2", proficiency);
      }

      return {
        view: cookingView(userId, now, {
          cookingRaw: cooking,
          farmRaw: nextFarm,
          fishingRaw: fishing,
          character: nextCharacter,
        }),
        result: {
          action,
          quantity,
          recipeId: recipe.id,
          recipeName: recipe.name,
          quality,
          usedRare,
          earnedXp,
          orderRewardGold: order?.rewardGold ?? 0,
          orderRewardReputation: order?.rewardReputation ?? 0,
          foodId,
          masteryGained,
          masteryAfter,
        },
      };
    });
    return Response.json({ ...result.view, result: result.result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "cooking_failed";
    const known = new Set([
      "recipe_locked",
      "not_enough_farm_items",
      "not_enough_fishing_items",
      "order_unavailable",
    ]);
    if (known.has(code)) return Response.json({ ok: false, error: code }, { status: 409 });
    throw error;
  }
}

export async function PATCH(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:cooking:favorite",
    userLimit: 60,
    ipLimit: 300,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { recipeId?: unknown } | null;
  const recipeId = typeof body?.recipeId === "string" ? body.recipeId : "";
  if (!COOKING_RECIPE_BY_ID.has(recipeId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const now = Date.now();
  const cooking = await db.transaction(async (tx) => {
    const current = parseCookingState(
      await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
      now,
    );
    const favorites = new Set(current.favoriteRecipeIds);
    if (favorites.has(recipeId)) favorites.delete(recipeId);
    else favorites.add(recipeId);
    const next = { ...current, favoriteRecipeIds: [...favorites] };
    await upsertSave(tx, userId, COOKING_SAVE_KEY, next);
    return next;
  });
  return Response.json({ ok: true, cooking });
}
