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
  emptyV2SkillsState,
  equippedCookingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  farmAvailableReputation,
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
  COOKING_LEVEL_CAP,
  COOKING_SAVE_KEY,
  COOKING_STANDING_DELIVERY_DAILY_LIMIT,
  addCookingFood,
  adjustedCookingXp,
  cookingFoodDefinition,
  cookingFoodId,
  cookingIngredientRequirementAccumulated,
  cookingLevelForXp,
  cookingLevelXpThreshold,
  cookingOrderReward,
  cookingOrders,
  cookingQuality,
  cookingStandingDeliveryReward,
  cookingXpReward,
  deliverableCookingFoods,
  emptyCookingState,
  parseCookingFoodInventory,
  parseCookingState,
  parseCookingStateWithLevelMigration,
  recordCookingActionStats,
  removeCookingFood,
  savedRareCookingIngredientCount,
  type CookingAction,
  type CookingFoodId,
  type CookingQuality,
} from "@/adventure/v2/cooking";
import { applyLifeXpGain } from "@/adventure/v2/lifeLevelProgression";
import { cookingPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import { LIFE_WORKSHOP_SAVE_KEY, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { consumeFinishedItem, rollHiddenBlueprint } from "@/adventure/v2/lifeCrafting";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { referralLifeTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import {
  recordCodexMasteryGameplayBatch,
  type CodexMasteryGameplayEvent,
} from "@/lib/server/codexMasteryGameplay";

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
  skillsRaw: unknown;
  inventoryRaw: unknown;
  character: CharacterSave;
  workshopRaw: unknown;
}) {
  const cooking = parseCookingState(values.cookingRaw, now);
  const farm = normalizeFarmForDay(parseFarmState(values.farmRaw), now);
  const fishing = parseFishingStock(values.fishingRaw);
  const level = cookingLevelForXp(cooking.xp);
  const job = currentCookingJob(values.character);
  const cookingSkillBonuses = equippedCookingBonuses(
    parseV2SkillsState(values.skillsRaw).equipped,
  );
  const workshop = parseLifeWorkshopState(values.workshopRaw);
  return {
    ok: true,
    now,
    cooking,
    cookingFoods: parseCookingFoodInventory(
      (values.inventoryRaw as InventorySave | null)?.cookingFoods,
    ),
    level,
    currentLevelXp: cookingLevelXpThreshold(level),
    nextLevelXp:
      level >= COOKING_LEVEL_CAP
        ? null
        : cookingLevelXpThreshold(level + 1),
    recipes: COOKING_RECIPES,
    orders: cookingOrders(userId, cooking),
    farmItems: farm.inventory,
    farmReputation: farmAvailableReputation(farm),
    fishingItems: fishing.items,
    fishingItemDefinitions: FISHING_CATCH_ITEMS,
    cookingJobId: job.jobId,
    cookingJobName: job.jobId ? V2_JOB_CATALOG[job.jobId]?.name ?? job.jobId : null,
    cookingJobTier: job.tier,
    cookingSkillBonuses,
    cookingPrepBalance: workshop.crafting.balances.cooking_prep_set ?? 0,
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
  const [cookingRaw, farmRaw, fishingRaw, skillsRaw, inventoryRaw, character, workshopRaw] = await Promise.all([
    readSave(db, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
    readSave<InventorySave>(db, userId, "inventory.v2", {}),
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
  ]);
  return Response.json(cookingView(userId, now, {
    cookingRaw,
    farmRaw,
    fishingRaw,
    skillsRaw,
    inventoryRaw,
    character,
    workshopRaw,
  }));
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
    foodId?: unknown;
    usePrep?: unknown;
  } | null;
  const recipeId = typeof body?.recipeId === "string" ? body.recipeId : "";
  const action: CookingAction | null =
    body?.action === "cook" ||
    body?.action === "order" ||
    body?.action === "standing_delivery"
      ? body.action
      : null;
  const useRare = body?.useRare === true;
  const usePrep = body?.usePrep === true && action === "cook";
  const requestedFoodId =
    typeof body?.foodId === "string" ? body.foodId : null;
  const rawQuantity = Number(body?.quantity);
  if (
    action === "standing_delivery" &&
    (!Number.isInteger(rawQuantity) ||
      rawQuantity < 1 ||
      rawQuantity > COOKING_STANDING_DELIVERY_DAILY_LIMIT)
  ) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const requestedQuantity = Math.max(1, Math.min(20, Math.floor(Number(body?.quantity) || 1)));
  const quantity =
    action === "order"
      ? 1
      : action === "standing_delivery"
        ? rawQuantity
        : requestedQuantity;
  const recipe = COOKING_RECIPE_BY_ID.get(recipeId);
  if (!recipe || !action) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  try {
    const result = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
      const skills = parseV2SkillsState(
        await lockSaveForUpdate(
          tx,
          userId,
          "skills.v2",
          emptyV2SkillsState(),
        ),
      );
      const cookingSkillBonuses = equippedCookingBonuses(skills.equipped);
      const farm = normalizeFarmForDay(
        parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now))),
        now,
      );
      let fishing = parseFishingStock(
        await lockSaveForUpdate(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()),
      );
      const parsedCooking = parseCookingStateWithLevelMigration(
        await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
        now,
      );
      let cooking = parsedCooking.state;
      let workshop = parseLifeWorkshopState(await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}));
      const inventory = await lockSaveForUpdate<InventorySave>(
        tx,
        userId,
        "inventory.v2",
        {},
      );
      const level = cookingLevelForXp(cooking.xp);
      const levelBonuses = cookingPost50Bonuses(level);
      if (action !== "standing_delivery" && level < recipe.requiredLevel) {
        throw new Error("recipe_locked");
      }

      const job = currentCookingJob(character);
      const order = action === "order"
        ? cookingOrders(userId, cooking).find(
            (entry) => entry.recipeId === recipe.id && !cooking.daily.completedOrderIds.includes(entry.id),
          )
        : null;
      if (action === "order" && !order) throw new Error("order_unavailable");

      let farmRequirements: FarmItemInventory = {};
      let usedRare = false;
      let savedRareIngredients = 0;
      let quality: CookingQuality;
      let deliveredFoodId: CookingFoodId | null = null;
      let nextInventory: InventorySave = inventory;
      const ingredientReductionRemainderBps = {
        ...(cooking.ingredientReductionRemainderBps ?? {}),
      };

      if (action === "cook") {
        farmRequirements = Object.fromEntries(
          Object.entries(recipe.farmIngredients).map(([id, count]) => {
            const remainderKey = `farm:${id}`;
            const requirement = cookingIngredientRequirementAccumulated({
              countPerDish: count ?? 0,
              quantity,
              cookingJobTier: job.tier,
              materialReductionPct:
                cookingSkillBonuses.materialReductionPct +
                levelBonuses.materialReductionPct,
              reductionRemainderBps:
                ingredientReductionRemainderBps[remainderKey],
            });
            ingredientReductionRemainderBps[remainderKey] =
              requirement.remainderBps;
            return [id, requirement.required];
          }),
        );
        usedRare = Boolean(useRare && recipe.optionalRareItemId);
        if (usedRare && recipe.optionalRareItemId) {
          farmRequirements[recipe.optionalRareItemId] = quantity;
        }
        if (!hasFarmItems(farm.inventory, farmRequirements)) {
          throw new Error("not_enough_farm_items");
        }
        savedRareIngredients = usedRare
          ? savedRareCookingIngredientCount({
              quantity,
              saveChancePct:
                cookingSkillBonuses.rareIngredientSaveChancePct +
                levelBonuses.rareIngredientSaveChancePct,
            })
          : 0;
        if (usedRare && recipe.optionalRareItemId) {
          farmRequirements[recipe.optionalRareItemId] =
            quantity - savedRareIngredients;
        }
        for (const [itemId, count] of Object.entries(
          recipe.fishingIngredients ?? {},
        )) {
          const remainderKey = `fishing:${itemId}`;
          const requirement = cookingIngredientRequirementAccumulated({
            countPerDish: count ?? 0,
            quantity,
            materialReductionPct:
              cookingSkillBonuses.materialReductionPct +
              levelBonuses.materialReductionPct,
            reductionRemainderBps:
              ingredientReductionRemainderBps[remainderKey],
          });
          const next = spendFishingCatchItem(
            fishing,
            itemId as keyof typeof FISHING_CATCH_ITEMS,
            requirement.required,
          );
          if (!next) throw new Error("not_enough_fishing_items");
          ingredientReductionRemainderBps[remainderKey] =
            requirement.remainderBps;
          fishing = next;
        }
        if (usePrep) {
          const consumed = consumeFinishedItem(workshop.crafting, "cooking_prep_set", quantity);
          if (!consumed) throw new Error("not_enough_prep_sets");
          workshop = { ...workshop, crafting: { ...consumed, aidsUsed: consumed.aidsUsed + quantity } };
        }
        quality = cookingQuality({
          cookingJobTier: job.tier,
          usedRare,
          carefulBonusPct: cookingSkillBonuses.carefulChancePct,
          masterpieceBonusPct:
            cookingSkillBonuses.masterpieceChancePct +
            levelBonuses.masterpieceChancePct +
            (usePrep ? 8 : 0),
        });
      } else {
        if (
          action === "standing_delivery" &&
          cooking.daily.standingDeliveries + quantity >
            COOKING_STANDING_DELIVERY_DAILY_LIMIT
        ) {
          throw new Error("standing_delivery_limit");
        }
        const requestedFood = requestedFoodId
          ? cookingFoodDefinition(requestedFoodId)
          : deliverableCookingFoods(inventory.cookingFoods, recipe.id)[0]?.food;
        if (!requestedFood || requestedFood.recipeId !== recipe.id) {
          throw new Error("cooked_food_unavailable");
        }
        const remainingFoods = removeCookingFood(
          inventory.cookingFoods,
          requestedFood.id,
          action === "standing_delivery" ? quantity : 1,
        );
        if (!remainingFoods) throw new Error("cooked_food_unavailable");
        deliveredFoodId = requestedFood.id;
        usedRare = requestedFood.usedRare;
        quality = requestedFood.quality;
        nextInventory = { ...inventory, cookingFoods: remainingFoods };
      }

      const orderReward = order ? cookingOrderReward(order, quality) : null;
      const standingDeliveryReward =
        action === "standing_delivery"
          ? cookingStandingDeliveryReward(recipe, quality, quantity)
          : null;
      const baseXp = adjustedCookingXp(recipe.requiredLevel, level, recipe.xp);
      const earnedXp =
        action === "standing_delivery"
          ? 0
          : cookingXpReward({
              baseXp:
                action === "order"
                  ? (orderReward?.bonusXp ?? 0)
                  : baseXp * quantity,
              bonusPct:
                (job.tier >= 2 ? 10 : 0) +
                cookingSkillBonuses.xpBonusPct,
            });
      const appliedCookingXp = applyLifeXpGain({
        xp: cooking.xp,
        gainedXp: earnedXp,
        legacyThreshold: cookingLevelXpThreshold,
      });
      cooking = {
        ...cooking,
        xp: appliedCookingXp.xp,
        ...(action === "cook"
          ? { ingredientReductionRemainderBps }
          : {}),
        discoveredRecipeIds:
          action === "cook"
            ? Array.from(
                new Set([...cooking.discoveredRecipeIds, recipe.id]),
              )
            : cooking.discoveredRecipeIds,
        stats: recordCookingActionStats(cooking, {
          action,
          quantity,
          quality,
          usedRare,
        }),
        daily: {
          ...cooking.daily,
          standingDeliveries:
            action === "standing_delivery"
              ? cooking.daily.standingDeliveries + quantity
              : cooking.daily.standingDeliveries,
          completedOrderIds: order
            ? [...cooking.daily.completedOrderIds, order.id]
            : cooking.daily.completedOrderIds,
        },
      };
      const nextFarm = {
        ...farm,
        inventory:
          action === "cook"
            ? spendFarmItems(farm.inventory, farmRequirements)
            : farm.inventory,
        stats: {
          ...farm.stats,
          reputation:
            farm.stats.reputation + (orderReward?.reputation ?? 0),
        },
      };

      const nextCharacter: CharacterSave = {
        ...character,
        gold:
          Math.max(0, Math.floor(Number(character.gold) || 0)) +
          (orderReward?.gold ?? 0) +
          (standingDeliveryReward?.totalGold ?? 0),
      };
      const foodId = action === "cook"
        ? cookingFoodId({
            recipeId: recipe.id,
            quality,
            usedRare,
            extended: job.tier >= 5,
          })
        : null;
      if (foodId) {
        nextInventory = {
          ...inventory,
          cookingFoods: addCookingFood(
            inventory.cookingFoods,
            foodId,
            quantity,
          ),
        };
      }

      await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
      await upsertSave(tx, userId, FISHING_STOCK_KEY, fishing);
      await upsertSave(tx, userId, COOKING_SAVE_KEY, cooking);
      await upsertSave(tx, userId, "character.v2", nextCharacter);
      await rewardReferralTutorialTasks(
        tx,
        userId,
        "새 모험가",
        referralLifeTaskIds(cookingLevelForXp(cooking.xp)),
      );
      let blueprintRecipeId: string | null = null;
      if (action === "cook") {
        const blueprint = rollHiddenBlueprint(workshop.crafting, "cooking", quantity);
        workshop = { ...workshop, crafting: blueprint.state };
        blueprintRecipeId = blueprint.recipe?.id ?? null;
        await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, workshop);
      }
      if (foodId || deliveredFoodId) {
        await upsertSave(tx, userId, "inventory.v2", nextInventory);
      }

      let masteryGained = 0;
      let masteryAfter: number | null = null;
      const codexMasteryEvents: CodexMasteryGameplayEvent[] = action === "cook"
        ? [{
            category: "cooking",
            entryId: recipe.id,
            amount: quantity,
            source: "cooking.complete",
          }]
        : [];
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
        if (masteryGained > 0) {
          codexMasteryEvents.push({
            category: "job",
            entryId: job.jobId,
            amount: masteryGained,
            source: "job.activity",
          });
        }
      }
      if (codexMasteryEvents.length > 0) {
        await recordCodexMasteryGameplayBatch(
          tx,
          userId,
          codexMasteryEvents,
          new Date(now),
        );
      }

      return {
        levelCurveMigrated: parsedCooking.levelCurveMigrated,
        view: cookingView(userId, now, {
          cookingRaw: cooking,
          farmRaw: nextFarm,
          fishingRaw: fishing,
          skillsRaw: skills,
          inventoryRaw: nextInventory,
          character: nextCharacter,
          workshopRaw: workshop,
        }),
        result: {
          action,
          quantity,
          recipeId: recipe.id,
          recipeName: recipe.name,
          quality,
          usedRare,
          savedRareIngredients,
          earnedXp,
          orderRewardGold: orderReward?.gold ?? 0,
          standingDeliveryRewardGold:
            standingDeliveryReward?.totalGold ?? 0,
          orderRewardReputation: orderReward?.reputation ?? 0,
          orderQualityBonusPct: orderReward?.qualityBonusPct ?? 0,
          foodId,
          deliveredFoodId,
          masteryGained,
          masteryAfter,
          usedPrep: usePrep,
          blueprintRecipeId,
        },
      };
    });
    if (result.result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.result.blueprintRecipeId });
    return Response.json({
      ...result.view,
      result: result.result,
      ...(result.levelCurveMigrated ? { levelCurveMigrated: true } : {}),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "cooking_failed";
    const known = new Set([
      "recipe_locked",
      "not_enough_farm_items",
      "not_enough_fishing_items",
      "cooked_food_unavailable",
      "order_unavailable",
      "standing_delivery_limit",
      "not_enough_prep_sets",
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
