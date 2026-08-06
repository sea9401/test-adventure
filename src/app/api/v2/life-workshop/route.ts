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
  consumeFinishedItem,
  lifeAidSpec,
  recipeMasteryStage,
  rollHiddenBlueprint,
  type LifeFinishedItemId,
} from "@/adventure/v2/lifeCrafting";

type CharacterSave = {
  gold?: unknown;
  bankedGold?: unknown;
  materials?: unknown;
  [key: string]: unknown;
};

function materialBalances(raw: unknown): Record<string, number> {
  return mergeDrops(raw, {});
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
}) {
  const levels = lifeLevels(args.woodcuttingRaw, args.miningRaw);
  const materials = materialBalances(args.charSave.materials);
  return {
    state: args.state,
    levels,
    materials,
    gold: Math.max(0, Math.floor(Number(args.charSave.gold) || 0)),
    bankedGold: Math.max(0, Math.floor(Number(args.charSave.bankedGold) || 0)),
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
    craftingRecipes: LIFE_CRAFTING_RECIPES.map((recipe) => {
      const level = Math.max(levels.woodcutting, levels.mining);
      const learned = !recipe.hidden || args.state.crafting.learnedHiddenRecipeIds.includes(recipe.id);
      const craftCount = args.state.crafting.craftCounts[recipe.id] ?? 0;
      const stage = recipeMasteryStage(craftCount);
      const batchLimit = [1, 5, 15, 40, 100, 100][stage];
      const maxByMaterials = Math.min(...Object.entries(recipe.costs).map(([id, amount]) => Math.floor((materials[id] ?? 0) / amount)));
      return { ...recipe, learned, craftCount, masteryStage: stage, batchLimit, maxCraftable: learned && level >= recipe.requiredLevel ? Math.max(0, Math.min(batchLimit, maxByMaterials)) : 0 };
    }),
  };
}

async function readWorkshopSnapshot(userId: string) {
  const [charSave, workshopRaw, woodcuttingRaw, miningRaw] = await Promise.all([
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readSave(db, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(db, userId, MINING_LOG_KEY, {}),
  ]);
  return {
    charSave,
    state: parseLifeWorkshopState(workshopRaw),
    woodcuttingRaw,
    miningRaw,
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
      if (!recipe || !Number.isFinite(quantity) || quantity < 1) return { error: "bad_craft_recipe" as const };
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
      return { ok: true as const, result: { action, recipeId: recipe.id, itemId: recipe.outputId, produced, grantedTitles }, snapshot: { state: nextState, charSave: nextCharSave, woodcuttingRaw, miningRaw } };
    }

    if (action === "activate_aid") {
      const itemId = typeof requestBody.itemId === "string" ? requestBody.itemId as LifeFinishedItemId : "" as LifeFinishedItemId;
      const spec = lifeAidSpec(itemId);
      if (!spec) return { error: "bad_aid" as const };
      if (state.crafting.activeAids[spec.activity]?.remainingUses) return { error: "aid_in_use" as const };
      const consumed = consumeFinishedItem(state.crafting, itemId, 1);
      if (!consumed) return { error: "aid_not_owned" as const };
      const nextState: LifeWorkshopState = { ...state, crafting: { ...consumed, activeAids: { ...consumed.activeAids, [spec.activity]: { itemId, remainingUses: spec.uses, enabled: true } } } };
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextState);
      return { ok: true as const, result: { action, itemId, activity: spec.activity }, snapshot: { state: nextState, charSave, woodcuttingRaw, miningRaw } };
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
    const status = result.error === "not_enough_gold" || result.error === "not_enough_materials"
      ? 409
      : 400;
    return Response.json({ ok: false, ...result }, { status });
  }
  if ("blueprintRecipeId" in result.result && result.result.blueprintRecipeId) await insertFeedEntry(userId, "life_blueprint", { recipeId: result.result.blueprintRecipeId });
  return Response.json({
    ok: true,
    result: result.result,
    ...workshopPayload(result.snapshot),
  });
}
