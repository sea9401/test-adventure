import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import {
  LIFE_PROCESSING_RECIPE_BY_ID,
  LIFE_PROCESSING_TITLE_MILESTONES,
  LIFE_SPECIALIZATION_BY_ID,
  LIFE_SPECIALIZATION_LEVEL,
  LIFE_TOOL_BONUS_MATERIAL_PCT,
  LIFE_TOOL_DURATION_REDUCTION_PCT,
  LIFE_TOOL_NAMES,
  LIFE_WORKSHOP_SAVE_KEY,
  lifeProcessingGreatSuccessPct,
  lifeRespecializationCost,
  maxProcessBatches,
  nextLifeToolUpgrade,
  parseLifeWorkshopState,
  rollProcessingBonusCount,
  type LifeSpecializationId,
  type LifeWorkshopActivity,
  type LifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";
import {
  MINING_LOG_KEY,
  parseMiningLog,
} from "@/adventure/v2/miningSession";
import { miningProgressionView } from "@/adventure/v2/miningProgression";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
} from "@/adventure/v2/woodcuttingSession";
import { woodcuttingProgressionView } from "@/adventure/v2/woodcuttingProgression";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import {
  LIFE_CRAFTING_RECIPE_BY_ID,
  LIFE_CRAFTING_RECIPES,
  activateLifeAid,
  isLifeCraftingRecipeAvailable,
  lifeAidSpec,
  recipeMasteryStage,
  rollHiddenBlueprint,
  type LifeFinishedItemId,
} from "@/adventure/v2/lifeCrafting";
import {
  FARM_CROP_ITEM_IDS,
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  emptyFarmState,
  farmCropItemCount,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  FAILED_DISH_FEED_RECIPE,
  RANCH_FEED_RECIPE,
} from "@/adventure/v2/ranch";
import { equippedPersonalCraftGoldDiscountPct } from "@/lib/server/equipmentLiberationCraftDiscount";

const CRAFTING_BATCH_LIMITS = [1, 5, 15, 40, 100, 100] as const;

type CharacterSave = {
  gold?: unknown;
  bankedGold?: unknown;
  materials?: unknown;
  [key: string]: unknown;
};

type InventorySave = Record<string, unknown> & {
  failedCookingDishes?: unknown;
};

function materialBalances(raw: unknown): Record<string, number> {
  return mergeDrops(raw, {});
}

function failedDishCount(raw: unknown): number {
  return Math.min(999_999, Math.max(0, Math.floor(Number(raw) || 0)));
}

function maxCraftableByCosts(
  balances: Record<string, number>,
  costs: Record<string, number>,
): number {
  const entries = Object.entries(costs).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(
    ...entries.map(([id, amount]) => Math.floor((balances[id] ?? 0) / amount)),
  );
}

function lifeLevels(woodcuttingRaw: unknown, miningRaw: unknown) {
  const woodcutting = parseWoodcuttingLog(woodcuttingRaw);
  const mining = parseMiningLog(miningRaw);
  return {
    woodcutting: woodcuttingProgressionView(
      woodcutting.cuts,
      woodcutting.xp,
    ).level,
    mining: miningProgressionView(mining.successes, mining.xp).level,
  };
}

function workshopPayload(args: {
  state: LifeWorkshopState;
  charSave: CharacterSave;
  woodcuttingRaw: unknown;
  miningRaw: unknown;
  farmRaw?: unknown;
  skillsRaw?: unknown;
  inventoryRaw?: unknown;
  equipmentRaw?: unknown;
}) {
  const levels = lifeLevels(args.woodcuttingRaw, args.miningRaw);
  const materials = materialBalances(args.charSave.materials);
  const farm = parseFarmState(args.farmRaw ?? emptyFarmState());
  const skills = parseV2SkillsState(args.skillsRaw ?? emptyV2SkillsState());
  const failedCookingDishes = failedDishCount(
    (args.inventoryRaw as InventorySave | null | undefined)?.failedCookingDishes,
  );
  const ranchCraftCount =
    args.state.crafting.craftCounts[RANCH_FEED_RECIPE.id] ?? 0;
  const ranchMasteryStage = recipeMasteryStage(ranchCraftCount);
  const ranchBatchLimit = CRAFTING_BATCH_LIMITS[ranchMasteryStage];
  const availableCropCount = farmCropItemCount(farm.inventory);
  const ranchMaxByMaterials = Math.floor(
    availableCropCount / RANCH_FEED_RECIPE.ingredientAmount,
  );
  const failedDishFeedCraftCount =
    args.state.crafting.craftCounts[FAILED_DISH_FEED_RECIPE.id] ?? 0;
  const failedDishFeedMasteryStage = recipeMasteryStage(
    failedDishFeedCraftCount,
  );
  const failedDishFeedBatchLimit =
    CRAFTING_BATCH_LIMITS[failedDishFeedMasteryStage];
  const liberationDiscountPct = equippedPersonalCraftGoldDiscountPct(
    args.equipmentRaw,
  );
  return {
    state: args.state,
    levels,
    materials,
    failedCookingDishes,
    gold: Math.max(0, Math.floor(Number(args.charSave.gold) || 0)),
    bankedGold: Math.max(0, Math.floor(Number(args.charSave.bankedGold) || 0)),
    liberationDiscountPct,
    personalCraftGoldCost: {
      baseGoldCost: 0,
      goldCost: 0,
      liberationDiscountPct,
    },
    recipes: [...LIFE_PROCESSING_RECIPE_BY_ID.values()].map((recipe) => ({
      ...recipe,
      maxBatches:
        levels[recipe.activity] >= recipe.requiredLevel
          ? maxProcessBatches(materials, recipe)
          : 0,
      greatSuccessPct: lifeProcessingGreatSuccessPct(
        recipe.activity,
        args.state,
        levels[recipe.activity],
      ),
    })),
    tools: (["woodcutting", "mining"] as const).map((activity) => ({
      activity,
      tier: args.state.tools[activity],
      name: LIFE_TOOL_NAMES[activity][args.state.tools[activity]],
      durationReductionPct:
        LIFE_TOOL_DURATION_REDUCTION_PCT[args.state.tools[activity]],
      bonusMaterialPct:
        LIFE_TOOL_BONUS_MATERIAL_PCT[args.state.tools[activity]],
      nextUpgrade: nextLifeToolUpgrade(activity, args.state),
    })),
    craftingRecipes: LIFE_CRAFTING_RECIPES.filter(
      isLifeCraftingRecipeAvailable,
    ).map((recipe) => {
      const level = Math.max(levels.woodcutting, levels.mining);
      const learned = !recipe.hidden || args.state.crafting.learnedHiddenRecipeIds.includes(recipe.id);
      const craftCount = args.state.crafting.craftCounts[recipe.id] ?? 0;
      const stage = recipeMasteryStage(craftCount);
      const batchLimit = [1, 5, 15, 40, 100, 100][stage];
      const maxByMaterials = maxCraftableByCosts(materials, recipe.costs);
      const maxByFailedDishes = recipe.failedDishCost
        ? Math.floor(failedCookingDishes / recipe.failedDishCost)
        : Number.MAX_SAFE_INTEGER;
      return { ...recipe, learned, craftCount, masteryStage: stage, batchLimit, maxCraftable: learned && level >= recipe.requiredLevel ? Math.max(0, Math.min(batchLimit, maxByMaterials, maxByFailedDishes)) : 0 };
    }),
    ranchCraftingRecipe: {
      ...RANCH_FEED_RECIPE,
      unlocked: skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID),
      craftCount: ranchCraftCount,
      masteryStage: ranchMasteryStage,
      batchLimit: ranchBatchLimit,
      maxCraftable: skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID)
        ? Math.max(0, Math.min(ranchBatchLimit, ranchMaxByMaterials))
        : 0,
      ownedFeed: farm.inventory.compound_feed ?? 0,
      availableCropCount,
      cropInventory: Object.fromEntries(
        FARM_CROP_ITEM_IDS.map((itemId) => [
          itemId,
          farm.inventory[itemId] ?? 0,
        ]),
      ),
    },
    failedDishFeedRecipe: {
      ...FAILED_DISH_FEED_RECIPE,
      craftCount: failedDishFeedCraftCount,
      masteryStage: failedDishFeedMasteryStage,
      batchLimit: failedDishFeedBatchLimit,
      maxCraftable: Math.max(
        0,
        Math.min(
          failedDishFeedBatchLimit,
          Math.floor(
            failedCookingDishes / FAILED_DISH_FEED_RECIPE.failedDishCost,
          ),
        ),
      ),
      ownedFeed: farm.inventory.compound_feed ?? 0,
    },
  };
}

async function readWorkshopSnapshot(userId: string) {
  const [charSave, workshopRaw, woodcuttingRaw, miningRaw, farmRaw, skillsRaw, inventoryRaw, equipmentRaw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, MINING_LOG_KEY, {}),
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState()),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
    readSave(db, userId, "inventory.v2", {}),
    readSave(db, userId, "equipment.v2", {}),
  ]);
  return {
    charSave,
    state: parseLifeWorkshopState(workshopRaw),
    woodcuttingRaw,
    miningRaw,
    farmRaw,
    skillsRaw,
    inventoryRaw,
    equipmentRaw,
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await readWorkshopSnapshot(userId);
  return Response.json({ ok: true, ...workshopPayload(snapshot) });
}

function isActivity(value: unknown): value is LifeWorkshopActivity {
  return value === "woodcutting" || value === "mining";
}

function consumeMaterials(
  materials: Record<string, number>,
  costs: Record<string, number>,
): Record<string, number> | null {
  for (const [id, amount] of Object.entries(costs)) {
    if ((materials[id] ?? 0) < amount) return null;
  }
  const next = { ...materials };
  for (const [id, amount] of Object.entries(costs)) {
    const balance = (next[id] ?? 0) - amount;
    if (balance > 0) next[id] = balance;
    else delete next[id];
  }
  return next;
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:life-workshop",
    userLimit: 30,
    ipLimit: 180,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const requestBody = body ?? {};
  const action = requestBody.action;
  if (action !== "process" && action !== "specialize" && action !== "upgrade_tool" && action !== "craft" && action !== "activate_aid" && action !== "toggle_aid") {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<CharacterSave>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const state = parseLifeWorkshopState(
      await lockSaveForUpdate(tx, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    );
    const woodcuttingRaw = await lockSaveForUpdate(
      tx,
      userId,
      WOODCUTTING_LOG_KEY,
      {},
    );
    const miningRaw = await lockSaveForUpdate(
      tx,
      userId,
      MINING_LOG_KEY,
      {},
    );
    const levels = lifeLevels(woodcuttingRaw, miningRaw);

    if (action === "craft") {
      const recipe = typeof requestBody.recipeId === "string" ? LIFE_CRAFTING_RECIPE_BY_ID.get(requestBody.recipeId) : undefined;
      const quantity = Math.floor(Number(requestBody.quantity));
      if (!recipe || !isLifeCraftingRecipeAvailable(recipe) || !Number.isFinite(quantity) || quantity < 1) return { error: "bad_craft_recipe" as const };
      if (recipe.hidden && !state.crafting.learnedHiddenRecipeIds.includes(recipe.id)) return { error: "blueprint_required" as const };
      const level = Math.max(levels.woodcutting, levels.mining);
      if (level < recipe.requiredLevel) return { error: "level_required" as const, requiredLevel: recipe.requiredLevel };
      const craftCount = state.crafting.craftCounts[recipe.id] ?? 0;
      const batchLimit = [1, 5, 15, 40, 100, 100][recipeMasteryStage(craftCount)];
      if (quantity > batchLimit) return { error: "batch_locked" as const, batchLimit };
      const materials = materialBalances(charSave.materials);
      const costs = Object.fromEntries(Object.entries(recipe.costs).map(([id, amount]) => [id, amount * quantity]));
      const nextMaterials = consumeMaterials(materials, costs);
      if (!nextMaterials) return { error: "not_enough_materials" as const };
      const equipmentRaw = await lockSaveForUpdate(
        tx,
        userId,
        "equipment.v2",
        {},
      );
      const liberationDiscountPct =
        equippedPersonalCraftGoldDiscountPct(equipmentRaw);
      let nextInventory: InventorySave | null = null;
      if (recipe.failedDishCost) {
        const inventory = await lockSaveForUpdate<InventorySave>(
          tx,
          userId,
          "inventory.v2",
          {},
        );
        const held = failedDishCount(inventory.failedCookingDishes);
        const required = recipe.failedDishCost * quantity;
        if (held < required) {
          return { error: "not_enough_failed_dishes" as const };
        }
        nextInventory = {
          ...inventory,
          failedCookingDishes: held - required,
        };
      }
      const produced = recipe.outputAmount * quantity;
      const discovered = new Set(state.crafting.discoveredRecipeIds);
      discovered.add(recipe.id);
      const nextCrafting = {
        ...state.crafting,
        balances: { ...state.crafting.balances, [recipe.outputId]: (state.crafting.balances[recipe.outputId] ?? 0) + produced },
        craftCounts: { ...state.crafting.craftCounts, [recipe.id]: craftCount + quantity },
        discoveredRecipeIds: [...discovered],
        totalCrafts: state.crafting.totalCrafts + quantity,
        furnitureCrafted: state.crafting.furnitureCrafted + (recipe.kind === "furniture" ? quantity : 0),
      };
      const nextState: LifeWorkshopState = { ...state, crafting: nextCrafting };
      const nextCharSave = { ...charSave, materials: nextMaterials };
      if (nextInventory) {
        await upsertSave(tx, userId, "inventory.v2", nextInventory);
      }
      await upsertSave(tx, userId, "character.v2", nextCharSave);
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      const grantedTitles: string[] = [];
      const furnitureTypes = nextCrafting.discoveredRecipeIds.filter((id) => LIFE_CRAFTING_RECIPE_BY_ID.get(id)?.kind === "furniture").length;
      for (const milestone of [
        { ready: nextCrafting.totalCrafts >= 1, id: "life_crafting_first" },
        { ready: nextCrafting.discoveredRecipeIds.length >= 7, id: "life_crafting_macgyver" },
        { ready: furnitureTypes >= 3, id: "life_diy_beginner" },
        { ready: nextCrafting.learnedHiddenRecipeIds.length >= 1, id: "life_blueprint_collector" },
      ]) {
        if (milestone.ready && await grantTitleIfMissingInTx(tx, userId, milestone.id, Date.now())) grantedTitles.push(milestone.id);
      }
      return { ok: true as const, result: { action, recipeId: recipe.id, itemId: recipe.outputId, produced, grantedTitles, baseGoldCost: 0, goldCost: 0, liberationDiscountPct }, snapshot: { state: nextState, charSave: nextCharSave, woodcuttingRaw, miningRaw, equipmentRaw } };
    }

    if (action === "activate_aid") {
      const itemId = typeof requestBody.itemId === "string" ? requestBody.itemId as LifeFinishedItemId : "" as LifeFinishedItemId;
      const spec = lifeAidSpec(itemId);
      if (!spec) return { error: "bad_aid" as const };
      if (state.crafting.activeAids[spec.activity]?.itemId === itemId) return { error: "aid_in_use" as const };
      const activation = activateLifeAid(state.crafting, itemId);
      if (!activation) return { error: "aid_not_owned" as const };
      const nextState: LifeWorkshopState = { ...state, crafting: activation.state };
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      return { ok: true as const, result: { action, itemId, activity: spec.activity, replaced: activation.replaced, resumed: activation.resumed }, snapshot: { state: nextState, charSave, woodcuttingRaw, miningRaw } };
    }

    if (action === "toggle_aid") {
      const activity = requestBody.activity;
      if (activity !== "woodcutting" && activity !== "mining" && activity !== "fishing") return { error: "bad_activity" as const };
      const aid = state.crafting.activeAids[activity];
      if (!aid) return { error: "aid_not_active" as const };
      const nextState: LifeWorkshopState = { ...state, crafting: { ...state.crafting, activeAids: { ...state.crafting.activeAids, [activity]: { ...aid, enabled: !aid.enabled } } } };
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      return { ok: true as const, result: { action, activity, enabled: !aid.enabled }, snapshot: { state: nextState, charSave, woodcuttingRaw, miningRaw } };
    }

    if (action === "process") {
      const recipe = typeof requestBody.recipeId === "string"
        ? LIFE_PROCESSING_RECIPE_BY_ID.get(requestBody.recipeId)
        : undefined;
      const batches = Math.floor(Number(requestBody.batches));
      if (!recipe || !Number.isFinite(batches) || batches < 1 || batches > 100) {
        return { error: "bad_recipe" as const };
      }
      if (levels[recipe.activity] < recipe.requiredLevel) {
        return { error: "level_required" as const, requiredLevel: recipe.requiredLevel };
      }
      const materials = materialBalances(charSave.materials);
      if (maxProcessBatches(materials, recipe) < batches) {
        return { error: "not_enough_materials" as const };
      }
      const consumed = consumeMaterials(materials, {
        [recipe.inputId]: recipe.inputAmount * batches,
      })!;
      const greatSuccessPct = lifeProcessingGreatSuccessPct(
        recipe.activity,
        state,
        levels[recipe.activity],
      );
      const bonusCount = rollProcessingBonusCount(batches, greatSuccessPct);
      const produced = (batches + bonusCount) * recipe.outputAmount;
      const nextMaterials = mergeDrops(consumed, { [recipe.outputId]: produced });
      const discovered = new Set(state.processing.discoveredMaterialIds);
      discovered.add(recipe.outputId);
      const nextState: LifeWorkshopState = {
        ...state,
        processing: {
          batches: state.processing.batches + batches,
          greatSuccesses: state.processing.greatSuccesses + bonusCount,
          discoveredMaterialIds: [...discovered],
        },
      };
      const blueprint = rollHiddenBlueprint(nextState.crafting, "processing", batches);
      nextState.crafting = blueprint.state;
      const nextCharSave = { ...charSave, materials: nextMaterials };
      await upsertSave(tx, userId, "character.v2", nextCharSave);
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      const grantedTitles: string[] = [];
      for (const milestone of LIFE_PROCESSING_TITLE_MILESTONES) {
        if (
          discovered.size >= milestone.count &&
          await grantTitleIfMissingInTx(tx, userId, milestone.titleId, Date.now())
        ) {
          grantedTitles.push(milestone.titleId);
        }
      }
      return {
        ok: true as const,
        result: { action, produced, bonusCount, outputId: recipe.outputId, grantedTitles, blueprintRecipeId: blueprint.recipe?.id },
        snapshot: { state: nextState, charSave: nextCharSave, woodcuttingRaw, miningRaw },
      };
    }

    if (!isActivity(requestBody.activity)) {
      return { error: "bad_activity" as const };
    }
    const activity = requestBody.activity;

    if (action === "specialize") {
      const specialization = typeof requestBody.specializationId === "string"
        ? LIFE_SPECIALIZATION_BY_ID.get(requestBody.specializationId as LifeSpecializationId)
        : undefined;
      if (!specialization || specialization.activity !== activity) {
        return { error: "bad_specialization" as const };
      }
      if (levels[activity] < LIFE_SPECIALIZATION_LEVEL) {
        return { error: "level_required" as const, requiredLevel: LIFE_SPECIALIZATION_LEVEL };
      }
      if (state.specializations[activity] === specialization.id) {
        return { error: "already_selected" as const };
      }
      const cost = lifeRespecializationCost(state, activity);
      const gold = Math.max(0, Math.floor(Number(charSave.gold) || 0));
      const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
      const payment = spendGold(gold, bankedGold, cost);
      if (!payment.ok) return { error: "not_enough_gold" as const, cost };
      const changing = state.specializations[activity] != null;
      const nextState: LifeWorkshopState = {
        ...state,
        specializations: { ...state.specializations, [activity]: specialization.id },
        respecializations: {
          ...state.respecializations,
          [activity]: (state.respecializations[activity] ?? 0) + (changing ? 1 : 0),
        },
      };
      const nextCharSave = {
        ...charSave,
        gold: payment.gold,
        bankedGold: payment.bankedGold,
      };
      await upsertSave(tx, userId, "character.v2", nextCharSave);
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      return {
        ok: true as const,
        result: { action, specializationId: specialization.id, cost },
        snapshot: { state: nextState, charSave: nextCharSave, woodcuttingRaw, miningRaw },
      };
    }

    const upgrade = nextLifeToolUpgrade(activity, state);
    if (!upgrade) return { error: "max_tool" as const };
    if (levels[activity] < upgrade.requiredLevel) {
      return { error: "level_required" as const, requiredLevel: upgrade.requiredLevel };
    }
    const materials = materialBalances(charSave.materials);
    const nextMaterials = consumeMaterials(materials, upgrade.materials);
    if (!nextMaterials) return { error: "not_enough_materials" as const };
    const nextState: LifeWorkshopState = {
      ...state,
      tools: { ...state.tools, [activity]: upgrade.tier },
    };
    const nextCharSave = { ...charSave, materials: nextMaterials };
    await upsertSave(tx, userId, "character.v2", nextCharSave);
    await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
    return {
      ok: true as const,
      result: { action, activity, tier: upgrade.tier },
      snapshot: { state: nextState, charSave: nextCharSave, woodcuttingRaw, miningRaw },
    };
  });

  if (!("ok" in result) || !result.ok) {
    const status = result.error === "not_enough_gold" || result.error === "not_enough_materials" || result.error === "not_enough_failed_dishes"
      ? 409
      : 400;
    return Response.json({ ok: false, ...result }, { status });
  }
  if ("blueprintRecipeId" in result.result && result.result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.result.blueprintRecipeId });
  const [farmRaw, skillsRaw, inventoryRaw, equipmentRaw] = await Promise.all([
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState()),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
    readSave(db, userId, "inventory.v2", {}),
    readSave(db, userId, "equipment.v2", {}),
  ]);
  return Response.json({
    ok: true,
    result: result.result,
    ...workshopPayload({
      ...result.snapshot,
      farmRaw,
      skillsRaw,
      inventoryRaw,
      equipmentRaw,
    }),
  });
}
