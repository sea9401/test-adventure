import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cookingFailedCombinations, cookingFirstDiscoveries } from "@/db/cookingSchema";
import { savesKv, users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import { addCumLevel, addJobCumLevel, parseProficiencyForChar } from "@/adventure/data/v2/proficiency";
import { V2_JOB_CATALOG, isCookingJobId, jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";
import { emptyV2SkillsState, equippedCookingBonuses, parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { FARM_CROPS, FARM_ITEMS, FARM_SAVE_KEY, emptyFarmState, farmAvailableReputation, normalizeFarmForDay, parseFarmState } from "@/adventure/v2/farm";
import { FISHING_CATCH_ITEMS, FISHING_STOCK_KEY, emptyFishingStock, parseFishingStock } from "@/adventure/v2/fishingStock";
import { applyLifeXpGain } from "@/adventure/v2/lifeLevelProgression";
import { cookingPost50Bonuses } from "@/adventure/v2/lifeLevelBonuses";
import { LIFE_WORKSHOP_SAVE_KEY, emptyLifeWorkshopState, parseLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { COOKING_PUBLIC_RECIPES, COOKING_PUBLIC_RECIPE_BY_ID } from "@/adventure/v2/cooking/catalog";
import { applyCookingDelivery, cookingRequests, cookingStandingDeliveryReward } from "@/adventure/v2/cooking/delivery";
import { activeCookingBuff, addCookingFood, cookingFoodDefinition, cookingFoodDefinitions, cookingFoodId, parseCookingFoodInventory, removeCookingFood, type CookingFoodId, type CookingQuality } from "@/adventure/v2/cooking/food";
import { COOKING_PANTRY_ITEMS, COOKING_PROCESSING_RECIPES, buyCookingPantryItem, processCookingIngredient, type CookingPantryItem, type CookingProcessingRecipe } from "@/adventure/v2/cooking/kitchen";
import { COOKING_LEVEL_CAP, COOKING_SAVE_KEY, COOKING_STANDING_DELIVERY_DAILY_LIMIT, chooseCookingSpecialty, cookingLevelForXp, cookingLevelXpThreshold, cookingSpecialtyRank, emptyCookingState, parseCookingState } from "@/adventure/v2/cooking/state";
import { COOKING_METHOD_NAMES, type CookingField, type CookingIngredientId, type CookingMethod, type CookingRecipeSecret } from "@/adventure/v2/cooking/types";
import {
  COOKING_SECRET_RECIPE_BY_ID,
  COOKING_SECRET_RECIPES,
  findSecretRecipe,
} from "@/lib/server/cooking/recipes";
import { cookingCombinationHash, resolveCookingResearch, type CookingIngredientBalances } from "@/lib/server/cooking/research";
import { insertFeedEntry, resolveUserDisplayName } from "@/lib/server/serverFeed";
import { referralLifeTaskIds } from "@/adventure/data/v2/referralTutorial";
import { rewardReferralTutorialTasks } from "@/lib/server/referrals";
import { recordCodexMasteryGameplayBatch, type CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";

type CharacterSave = Record<string, unknown> & {
  gold?: number;
  bankedGold?: number;
  class?: unknown;
  level?: number;
  name?: string;
  specChoice?: string;
  activeFoodBuff?: unknown;
};
type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
  failedCookingDishes?: unknown;
};
type FirstDiscoveryRow = {
  recipeId: string;
  actorName: string;
  authoritativeActorName: string | null;
  discoveredAt: Date;
};
type StoredFailedResearchRow = {
  method: string;
  ingredientIds: string[];
  createdAt: Date;
};
type FailedResearchRow = {
  method: CookingMethod;
  ingredientIds: CookingIngredientId[];
  createdAt: Date;
};

const DEFAULT_ACTOR_NAME = "이름 없는 모험가";
const COOKING_PREP_SET_ID = "cooking_prep_set" as const;
const COOKING_PREP_SET_MASTERPIECE_BONUS_PCT = 8;
const RARE_FARM_COOKING_INGREDIENT_IDS = new Set<string>(
  Object.values(FARM_CROPS).map((crop) => crop.rareItemId),
);
const KITCHEN_RESEARCH_INGREDIENT_IDS = new Set<string>([
  ...COOKING_PANTRY_ITEMS.map((entry) => entry.id),
  ...COOKING_PROCESSING_RECIPES.map((entry) => entry.outputId),
]);

function isKnownCookingIngredientId(value: unknown): value is CookingIngredientId {
  if (typeof value !== "string") return false;
  const [kind, id, extra] = value.split(":");
  if (!id || extra !== undefined) return false;
  if (kind === "farm") return Object.hasOwn(FARM_ITEMS, id);
  if (kind === "fishing") return Object.hasOwn(FISHING_CATCH_ITEMS, id);
  return KITCHEN_RESEARCH_INGREDIENT_IDS.has(value);
}

function normalizeFailedResearchRow(
  row: StoredFailedResearchRow,
): FailedResearchRow | null {
  if (!Object.hasOwn(COOKING_METHOD_NAMES, row.method)) return null;
  if (!(row.createdAt instanceof Date) || !Number.isFinite(row.createdAt.getTime())) {
    return null;
  }
  const ingredientIds = row.ingredientIds.filter(isKnownCookingIngredientId);
  if (
    ingredientIds.length < 2 ||
    ingredientIds.length > 5 ||
    ingredientIds.length !== row.ingredientIds.length ||
    new Set(ingredientIds).size !== ingredientIds.length
  ) {
    return null;
  }
  return {
    method: row.method as CookingMethod,
    ingredientIds,
    createdAt: row.createdAt,
  };
}

function currentCookingJob(char: CharacterSave) {
  const cls = parseV2Class(char.class);
  const candidate = jobIdFromLegacy(cls, typeof char.specChoice === "string" ? char.specChoice : null);
  const jobId = isCookingJobId(candidate) ? candidate : null;
  return { cls, jobId, tier: jobId ? V2_JOB_CATALOG[jobId]?.tier ?? 0 : 0 };
}

function ingredientBalances(
  farmItems: Record<string, number | undefined>,
  fishingItems: Record<string, number | undefined>,
  kitchenItems: Record<string, number | undefined>,
): CookingIngredientBalances {
  return {
    farm: Object.fromEntries(Object.entries(farmItems).filter(([, count]) => Number(count) > 0)) as Record<string, number>,
    fishing: Object.fromEntries(Object.entries(fishingItems).filter(([, count]) => Number(count) > 0)) as Record<string, number>,
    kitchen: Object.fromEntries(Object.entries(kitchenItems).filter(([, count]) => Number(count) > 0)) as Record<string, number>,
  };
}

function failedDishCount(raw: unknown): number {
  return Math.min(999_999, Math.max(0, Math.floor(Number(raw) || 0)));
}

function knownRecipeDetails(discoveredIds: readonly string[]) {
  const known = new Set(discoveredIds);
  return COOKING_SECRET_RECIPES.filter((recipe) => known.has(recipe.id)).map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
  }));
}

function publicDiscoveryDetails(
  firstDiscoveries: readonly FirstDiscoveryRow[],
  discoveredRecipeIds: readonly string[],
) {
  const registeredRecipeIds = new Set(discoveredRecipeIds);
  return firstDiscoveries.flatMap((row) => {
    const recipe = COOKING_PUBLIC_RECIPE_BY_ID.get(row.recipeId);
    if (!recipe) return [];
    return [{
      recipeName: recipe.name,
      imageSrc: recipe.imageSrc,
      actorName: row.authoritativeActorName?.trim() || row.actorName,
      discoveredAt: row.discoveredAt.getTime(),
      codexRegistered: registeredRecipeIds.has(row.recipeId),
    }];
  });
}

function isRareCookingIngredient(ingredientId: CookingIngredientId): boolean {
  const [kind, id] = ingredientId.split(":");
  if (kind === "farm") return RARE_FARM_COOKING_INGREDIENT_IDS.has(id);
  if (kind !== "fishing") return false;
  const tier = FISHING_CATCH_ITEMS[id as keyof typeof FISHING_CATCH_ITEMS]?.tier;
  return tier === "rare" || tier === "epic" || tier === "legendary";
}

function cookingView(userId: string, now: number, values: {
  cookingRaw: unknown;
  farmRaw: unknown;
  fishingRaw: unknown;
  skillsRaw: unknown;
  inventoryRaw: unknown;
  lifeWorkshopRaw: unknown;
  character: CharacterSave;
  firstDiscoveries: readonly FirstDiscoveryRow[];
  failedResearches: readonly FailedResearchRow[];
}) {
  const cooking = parseCookingState(values.cookingRaw, now);
  const farm = normalizeFarmForDay(parseFarmState(values.farmRaw), now);
  const fishing = parseFishingStock(values.fishingRaw);
  const inventory = (values.inventoryRaw ?? {}) as InventorySave;
  const lifeWorkshop = parseLifeWorkshopState(values.lifeWorkshopRaw);
  const level = cookingLevelForXp(cooking.xp);
  const job = currentCookingJob(values.character);
  return {
    ok: true,
    now,
    cooking,
    level,
    currentLevelXp: cookingLevelXpThreshold(level),
    nextLevelXp: level >= COOKING_LEVEL_CAP ? null : cookingLevelXpThreshold(level + 1),
    recipeTotal: COOKING_PUBLIC_RECIPES.length,
    knownRecipes: knownRecipeDetails(cooking.discoveredRecipeIds),
    publicDiscoveries: publicDiscoveryDetails(
      values.firstDiscoveries,
      cooking.discoveredRecipeIds,
    ),
    failedResearches: values.failedResearches.map((row) => ({
      method: row.method,
      ingredientIds: [...row.ingredientIds],
      createdAt: row.createdAt.getTime(),
    })),
    requests: cookingRequests(userId, cooking),
    cookingFoods: parseCookingFoodInventory(inventory.cookingFoods),
    cookingFoodDefinitions: cookingFoodDefinitions(inventory.cookingFoods),
    failedCookingDishes: failedDishCount(inventory.failedCookingDishes),
    cookingPrepSets: lifeWorkshop.crafting.balances[COOKING_PREP_SET_ID] ?? 0,
    farmItems: farm.inventory,
    farmItemDefinitions: FARM_ITEMS,
    farmReputation: farmAvailableReputation(farm),
    fishingItems: fishing.items,
    fishingItemDefinitions: FISHING_CATCH_ITEMS,
    kitchenItems: cooking.kitchenItems,
    pantryItems: COOKING_PANTRY_ITEMS,
    processingRecipes: COOKING_PROCESSING_RECIPES,
    cookingJobId: job.jobId,
    cookingJobName: job.jobId ? V2_JOB_CATALOG[job.jobId]?.name ?? job.jobId : null,
    cookingJobTier: job.tier,
    cookingSkillBonuses: equippedCookingBonuses(parseV2SkillsState(values.skillsRaw).equipped),
  };
}

type DbExecutor = Pick<typeof db, "select">;
async function firstDiscoveryRows(executor: DbExecutor): Promise<FirstDiscoveryRow[]> {
  return executor
    .select({
      recipeId: cookingFirstDiscoveries.recipeId,
      actorName: cookingFirstDiscoveries.actorName,
      authoritativeActorName: sql<string | null>`coalesce(
        nullif(btrim(${users.gameName}), ''),
        nullif(btrim(${savesKv.value}->>'name'), '')
      )`,
      discoveredAt: cookingFirstDiscoveries.discoveredAt,
    })
    .from(cookingFirstDiscoveries)
    .innerJoin(users, eq(users.id, cookingFirstDiscoveries.userId))
    .leftJoin(savesKv, and(
      eq(savesKv.userId, cookingFirstDiscoveries.userId),
      eq(savesKv.key, "character-profile.v2"),
    ));
}

async function failedCombinationRows(
  executor: DbExecutor,
  userId: string,
): Promise<FailedResearchRow[]> {
  const rows = await executor
    .select({
      method: cookingFailedCombinations.method,
      ingredientIds: cookingFailedCombinations.ingredientIds,
      createdAt: cookingFailedCombinations.createdAt,
    })
    .from(cookingFailedCombinations)
    .where(eq(cookingFailedCombinations.userId, userId))
    .orderBy(desc(cookingFailedCombinations.createdAt))
    .limit(100);
  return rows.flatMap((row) => {
    const normalized = normalizeFailedResearchRow(row);
    if (!normalized) return [];
    const recipe = findSecretRecipe(normalized.method, normalized.ingredientIds);
    return recipe && recipe.discovery !== "basic" ? [] : [normalized];
  });
}

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const limited = enforceUserAndIpRateLimit(req, { userId, action: "v2:cooking:get", userLimit: 120, ipLimit: 600, windowMs: 60_000 });
  if (limited) return limited;
  const now = Date.now();
  const [cookingRaw, farmRaw, fishingRaw, skillsRaw, inventoryRaw, lifeWorkshopRaw, character, discoveries, failedResearches] = await Promise.all([
    readSave(db, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
    readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    readSave(db, userId, "skills.v2", emptyV2SkillsState()),
    readSave<InventorySave>(db, userId, "inventory.v2", {}),
    readSave(db, userId, LIFE_WORKSHOP_SAVE_KEY, emptyLifeWorkshopState()),
    readSave<CharacterSave>(db, userId, "character.v2", {}),
    firstDiscoveryRows(db),
    failedCombinationRows(db, userId),
  ]);
  return Response.json(cookingView(userId, now, {
    cookingRaw,
    farmRaw,
    fishingRaw,
    skillsRaw,
    inventoryRaw,
    lifeWorkshopRaw,
    character,
    firstDiscoveries: discoveries,
    failedResearches,
  }));
}

function positiveQuantity(raw: unknown, maximum = 20): number {
  const quantity = Math.floor(Number(raw) || 0);
  if (quantity < 1 || quantity > maximum) throw new Error("invalid_quantity");
  return quantity;
}

function consumeCraftIngredients(args: {
  recipe: CookingRecipeSecret;
  quantity: number;
  balances: CookingIngredientBalances;
  ordinaryReductionPct: number;
  allIngredientReductionPct: number;
  remainders: Record<string, number>;
}): { balances: CookingIngredientBalances; remainders: Record<string, number> } {
  const balances: CookingIngredientBalances = {
    farm: { ...args.balances.farm }, fishing: { ...args.balances.fishing }, kitchen: { ...args.balances.kitchen },
  };
  const remainders = { ...args.remainders };
  for (const ingredient of args.recipe.ingredients) {
    const reductionPct = args.allIngredientReductionPct
      + (isRareCookingIngredient(ingredient.id) ? 0 : args.ordinaryReductionPct);
    const reductionBps = Math.min(5_000, Math.max(0, Math.round(reductionPct * 100)));
    const exactBps = ingredient.count * args.quantity * (10_000 - reductionBps) + (remainders[ingredient.id] ?? 0);
    const required = Math.floor(exactBps / 10_000);
    remainders[ingredient.id] = exactBps % 10_000;
    const [kind, shortId] = ingredient.id.split(":");
    const bucket = kind === "farm" ? balances.farm : kind === "fishing" ? balances.fishing : balances.kitchen;
    const key = kind === "farm" || kind === "fishing" ? shortId : ingredient.id;
    const held = bucket[key] ?? 0;
    if (held < required) throw new Error(kind === "fishing" ? "not_enough_fishing_items" : kind === "farm" ? "not_enough_farm_items" : "not_enough_kitchen_items");
    if (held === required) delete bucket[key];
    else bucket[key] = held - required;
  }
  return { balances, remainders };
}

function rollCookingQuality(args: { jobTier: number; carefulChancePct: number; masterpieceChancePct: number }): CookingQuality {
  const masterpiece = Math.min(75, args.masterpieceChancePct + (args.jobTier >= 4 ? 5 : 0));
  const careful = Math.min(90 - masterpiece, args.carefulChancePct + args.jobTier * 3);
  const roll = Math.random() * 100;
  if (roll < masterpiece) return "masterpiece";
  if (roll < masterpiece + careful) return "careful";
  return "normal";
}

type PostBody = {
  action?: unknown; recipeId?: unknown; requestId?: unknown; foodId?: unknown;
  method?: unknown; ingredientIds?: unknown; itemId?: unknown; field?: unknown; quantity?: unknown;
  usePrepSet?: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as PostBody | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const pantryPurchase = action === "buy_pantry";
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: pantryPurchase ? "v2:cooking:shop:buy_pantry" : "v2:cooking:post",
    userLimit: pantryPurchase ? 120 : 40,
    ipLimit: pantryPurchase ? 720 : 240,
    windowMs: 60_000,
  });
  if (limited) return limited;
  if (!["research", "craft", "buy_pantry", "process", "choose_specialty", "favorite", "deliver", "standing_delivery"].includes(action)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const now = Date.now();
  try {
    const researchActorName = action === "research"
      ? await resolveUserDisplayName(userId)
      : null;
    const transactionResult = await db.transaction(async (tx) => {
      const character = await lockSaveForUpdate<CharacterSave>(tx, userId, "character.v2", {});
      const skills = parseV2SkillsState(await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()));
      let farm = normalizeFarmForDay(parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now))), now);
      let fishing = parseFishingStock(await lockSaveForUpdate(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()));
      let cooking = parseCookingState(await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now)), now);
      let inventory = await lockSaveForUpdate<InventorySave>(tx, userId, "inventory.v2", {});
      let lifeWorkshop = parseLifeWorkshopState(await lockSaveForUpdate(
        tx,
        userId,
        LIFE_WORKSHOP_SAVE_KEY,
        emptyLifeWorkshopState(),
      ));
      let lifeWorkshopChanged = false;
      let nextCharacter = character;
      let feedRecipeId: string | null = null;
      let result: Record<string, unknown> = { action };
      const job = currentCookingJob(character);
      const skillBonuses = equippedCookingBonuses(skills.equipped);

      if (action === "research") {
        const method = body?.method as CookingMethod;
        const rawIngredients = Array.isArray(body?.ingredientIds) ? body.ingredientIds : [];
        const ingredientIds = rawIngredients.filter((id): id is CookingIngredientId => typeof id === "string");
        if (ingredientIds.length !== rawIngredients.length) throw new Error("invalid_ingredient");
        const comboHash = cookingCombinationHash(method, ingredientIds);
        const previous = await tx.select({ comboHash: cookingFailedCombinations.comboHash })
          .from(cookingFailedCombinations)
          .where(and(eq(cookingFailedCombinations.userId, userId), eq(cookingFailedCombinations.comboHash, comboHash)))
          .limit(1);
        const transition = resolveCookingResearch({
          state: cooking, method, ingredientIds,
          balances: ingredientBalances(farm.inventory, fishing.items, cooking.kitchenItems),
          failedBefore: previous.length > 0,
        });
        cooking = { ...transition.state, kitchenItems: transition.balances.kitchen };
        farm = { ...farm, inventory: transition.balances.farm };
        fishing = { ...fishing, items: transition.balances.fishing };
        if (transition.kind === "failure") {
          await tx.insert(cookingFailedCombinations).values({ userId, comboHash, method, ingredientIds }).onConflictDoNothing();
          inventory = { ...inventory, failedCookingDishes: failedDishCount(inventory.failedCookingDishes) + 1 };
          result = { action, outcome: "failure", earnedXp: ingredientIds.length * 2, failedDishCount: 1 };
        } else {
          const inserted = await tx.insert(cookingFirstDiscoveries)
            .values({
              recipeId: transition.recipe!.id,
              userId,
              actorName: researchActorName ?? DEFAULT_ACTOR_NAME,
            })
            .onConflictDoNothing({ target: cookingFirstDiscoveries.recipeId })
            .returning({ recipeId: cookingFirstDiscoveries.recipeId });
          const firstDiscovery = inserted.length > 0;
          if (firstDiscovery) feedRecipeId = transition.recipe!.id;
          result = { action, outcome: "success", recipeId: transition.recipe!.id, recipeName: transition.recipe!.name, firstDiscovery, earnedXp: transition.recipe!.researchXp };
        }
      } else if (action === "craft") {
        const recipeId = typeof body?.recipeId === "string" ? body.recipeId : "";
        const recipe = COOKING_SECRET_RECIPE_BY_ID.get(recipeId);
        const quantity = positiveQuantity(body?.quantity ?? 1);
        const usePrepSet = body?.usePrepSet === true;
        if (!recipe || !cooking.discoveredRecipeIds.includes(recipe.id) || cookingLevelForXp(cooking.xp) < recipe.requiredLevel) throw new Error("recipe_locked");
        const heldPrepSets = lifeWorkshop.crafting.balances[COOKING_PREP_SET_ID] ?? 0;
        if (usePrepSet && heldPrepSets < quantity) throw new Error("not_enough_cooking_prep_sets");
        const levelBonuses = cookingPost50Bonuses(cookingLevelForXp(cooking.xp));
        const consumed = consumeCraftIngredients({
          recipe, quantity,
          balances: ingredientBalances(farm.inventory, fishing.items, cooking.kitchenItems),
          ordinaryReductionPct: skillBonuses.materialReductionPct,
          allIngredientReductionPct: levelBonuses.materialReductionPct,
          remainders: cooking.ingredientReductionRemainderBps ?? {},
        });
        if (usePrepSet) {
          const balances = { ...lifeWorkshop.crafting.balances };
          const remainingPrepSets = heldPrepSets - quantity;
          if (remainingPrepSets > 0) balances[COOKING_PREP_SET_ID] = remainingPrepSets;
          else delete balances[COOKING_PREP_SET_ID];
          lifeWorkshop = {
            ...lifeWorkshop,
            crafting: {
              ...lifeWorkshop.crafting,
              balances,
              aidsUsed: lifeWorkshop.crafting.aidsUsed + quantity,
            },
          };
          lifeWorkshopChanged = true;
        }
        farm = { ...farm, inventory: consumed.balances.farm };
        fishing = { ...fishing, items: consumed.balances.fishing };
        const originRows = await tx.select({ userId: cookingFirstDiscoveries.userId }).from(cookingFirstDiscoveries).where(eq(cookingFirstDiscoveries.recipeId, recipe.id)).limit(1);
        const originator = originRows[0]?.userId === userId;
        const specialtyBonusPct = cooking.specialty?.field === recipe.field ? cookingSpecialtyRank(cooking.specialty.xp) : 0;
        const quality = rollCookingQuality({
          jobTier: job.tier,
          carefulChancePct: skillBonuses.carefulChancePct,
          masterpieceChancePct: skillBonuses.masterpieceChancePct
            + levelBonuses.masterpieceChancePct
            + (usePrepSet ? COOKING_PREP_SET_MASTERPIECE_BONUS_PCT : 0),
        });
        const foodId = cookingFoodId({ recipeId: recipe.id, quality, originator, specialtyBonusPct });
        inventory = { ...inventory, cookingFoods: addCookingFood(inventory.cookingFoods, foodId, quantity) };
        const foodXpBonus = activeCookingBuff(character.activeFoodBuff, now)?.effect.cookingXpPct ?? 0;
        const earnedXp = Math.max(1, Math.round(recipe.craftXp * quantity * (100 + skillBonuses.xpBonusPct + foodXpBonus + (job.tier >= 2 ? 10 : 0)) / 100));
        const applied = applyLifeXpGain({ xp: cooking.xp, gainedXp: earnedXp, legacyThreshold: cookingLevelXpThreshold });
        cooking = {
          ...cooking, xp: applied.xp, kitchenItems: consumed.balances.kitchen,
          ingredientReductionRemainderBps: consumed.remainders,
          specialty: cooking.specialty?.field === recipe.field ? { ...cooking.specialty, xp: cooking.specialty.xp + recipe.tier * 10 * quantity } : cooking.specialty,
          stats: { ...cooking.stats, dishesCooked: cooking.stats.dishesCooked + quantity, masterpiecesCooked: cooking.stats.masterpiecesCooked + (quality === "masterpiece" ? quantity : 0) },
        };
        result = { action, recipeId, quantity, quality, foodId, originator, specialtyBonusPct, earnedXp, usedPrepSets: usePrepSet ? quantity : 0 };
      } else if (action === "buy_pantry") {
        const itemId = body?.itemId as CookingPantryItem["id"];
        const quantity = positiveQuantity(body?.quantity ?? 1, 100);
        const bought = buyCookingPantryItem({
          gold: Number(character.gold) || 0,
          bankedGold: Number(character.bankedGold) || 0,
          kitchenItems: cooking.kitchenItems,
        }, itemId, quantity);
        nextCharacter = {
          ...character,
          gold: bought.gold,
          bankedGold: bought.bankedGold,
        };
        cooking = { ...cooking, kitchenItems: bought.kitchenItems };
        result = { action, itemId, quantity };
      } else if (action === "process") {
        const itemId = body?.itemId as CookingProcessingRecipe["outputId"];
        const quantity = positiveQuantity(body?.quantity ?? 1, 100);
        const processed = processCookingIngredient({ farmItems: farm.inventory, kitchenItems: cooking.kitchenItems }, itemId, quantity);
        farm = { ...farm, inventory: processed.farmItems };
        cooking = { ...cooking, kitchenItems: processed.kitchenItems };
        result = { action, itemId, quantity };
      } else if (action === "choose_specialty") {
        const field = body?.field as CookingField;
        if (!["hearth", "pot", "baking", "seafood", "medicinal"].includes(field)) throw new Error("invalid_specialty");
        cooking = chooseCookingSpecialty(cooking, field);
        result = { action, field };
      } else if (action === "favorite") {
        const recipeId = typeof body?.recipeId === "string" ? body.recipeId : "";
        if (!COOKING_PUBLIC_RECIPE_BY_ID.has(recipeId) || !cooking.discoveredRecipeIds.includes(recipeId)) throw new Error("recipe_locked");
        const favorites = new Set(cooking.favoriteRecipeIds);
        if (favorites.has(recipeId)) favorites.delete(recipeId); else favorites.add(recipeId);
        cooking = { ...cooking, favoriteRecipeIds: [...favorites] };
        result = { action, recipeId, favorite: favorites.has(recipeId) };
      } else if (action === "deliver") {
        const requestId = typeof body?.requestId === "string" ? body.requestId : "";
        const foodId = (typeof body?.foodId === "string" ? body.foodId : "") as CookingFoodId;
        const quantity = positiveQuantity(body?.quantity ?? 1, 100);
        const requests = cookingRequests(userId, cooking);
        const deliveryRequest = [...requests.daily, requests.weekly].find((entry) => entry.id === requestId);
        const food = cookingFoodDefinition(foodId);
        if (!deliveryRequest || !food) throw new Error("bad_request");
        const remaining = removeCookingFood(inventory.cookingFoods, foodId, quantity);
        if (!remaining) throw new Error("cooked_food_unavailable");
        const applied = applyCookingDelivery(cooking, deliveryRequest, food, quantity);
        cooking = applied.state;
        inventory = { ...inventory, cookingFoods: remaining };
        if (applied.rewards) {
          nextCharacter = { ...character, gold: Math.max(0, Math.floor(Number(character.gold) || 0)) + applied.rewards.gold };
          farm = { ...farm, stats: { ...farm.stats, reputation: farm.stats.reputation + applied.rewards.reputation } };
        }
        result = { action, requestId, foodId, quantity, scoreAdded: applied.scoreAdded, completedNow: applied.completedNow, rewards: applied.rewards };
      } else if (action === "standing_delivery") {
        const foodId = (typeof body?.foodId === "string" ? body.foodId : "") as CookingFoodId;
        const quantity = positiveQuantity(body?.quantity ?? 1, COOKING_STANDING_DELIVERY_DAILY_LIMIT);
        if (cooking.daily.standingDeliveries + quantity > COOKING_STANDING_DELIVERY_DAILY_LIMIT) throw new Error("standing_delivery_limit");
        const food = cookingFoodDefinition(foodId);
        if (!food) throw new Error("bad_request");
        const remaining = removeCookingFood(inventory.cookingFoods, foodId, quantity);
        if (!remaining) throw new Error("cooked_food_unavailable");
        const gold = cookingStandingDeliveryReward(food, quantity);
        inventory = { ...inventory, cookingFoods: remaining };
        cooking = { ...cooking, daily: { ...cooking.daily, standingDeliveries: cooking.daily.standingDeliveries + quantity } };
        nextCharacter = { ...character, gold: Math.max(0, Math.floor(Number(character.gold) || 0)) + gold };
        result = { action, foodId, quantity, gold };
      }

      await upsertSave(tx, userId, COOKING_SAVE_KEY, cooking);
      await upsertSave(tx, userId, FARM_SAVE_KEY, farm);
      await upsertSave(tx, userId, FISHING_STOCK_KEY, fishing);
      await upsertSave(tx, userId, "inventory.v2", inventory);
      await upsertSave(tx, userId, "character.v2", nextCharacter);
      if (lifeWorkshopChanged) {
        await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, lifeWorkshop);
      }

      let masteryGained = 0;
      let masteryAfter: number | null = null;
      const earnedXp = action === "craft" ? Math.max(0, Math.floor(Number(result.earnedXp) || 0)) : 0;
      const codexEvents: CodexMasteryGameplayEvent[] = action === "craft" && typeof result.recipeId === "string"
        ? [{ category: "cooking", entryId: result.recipeId, amount: Number(result.quantity) || 1, source: "cooking.complete" }]
        : [];
      if (job.jobId && earnedXp > 0) {
        let proficiency = parseProficiencyForChar(await lockSaveForUpdate(tx, userId, "proficiency.v2", {}), character);
        masteryGained = earnedXp;
        proficiency = addCumLevel(proficiency, tier1ClassOf(job.cls), masteryGained);
        proficiency = addJobCumLevel(proficiency, job.jobId, masteryGained);
        masteryAfter = proficiency.jobCumLevel?.[job.jobId] ?? 0;
        await upsertSave(tx, userId, "proficiency.v2", proficiency);
        codexEvents.push({ category: "job", entryId: job.jobId, amount: masteryGained, source: "job.activity" });
      }
      if (codexEvents.length > 0) await recordCodexMasteryGameplayBatch(tx, userId, codexEvents, new Date(now));
      if (action === "craft" || action === "research") {
        await rewardReferralTutorialTasks(tx, userId, "새 모험가", referralLifeTaskIds(cookingLevelForXp(cooking.xp)));
      }
      const discoveries = await firstDiscoveryRows(tx);
      const failedResearches = await failedCombinationRows(tx, userId);
      return {
        feedRecipeId,
        result: { ...result, masteryGained, masteryAfter },
        view: cookingView(userId, now, {
          cookingRaw: cooking,
          farmRaw: farm,
          fishingRaw: fishing,
          skillsRaw: skills,
          inventoryRaw: inventory,
          lifeWorkshopRaw: lifeWorkshop,
          character: nextCharacter,
          firstDiscoveries: discoveries,
          failedResearches,
        }),
      };
    });
    if (transactionResult.feedRecipeId) {
      const feedRecipe = COOKING_PUBLIC_RECIPE_BY_ID.get(transactionResult.feedRecipeId);
      if (feedRecipe) {
        await insertFeedEntry(userId, "cooking_discovery", {
          recipeId: feedRecipe.id,
          recipeName: feedRecipe.name,
        });
      }
    }
    return Response.json({ ...transactionResult.view, result: transactionResult.result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "cooking_failed";
    const conflict = new Set([
      "duplicate_combination", "method_locked", "too_few_ingredients", "too_many_ingredients",
      "invalid_combination", "invalid_ingredient", "not_enough_ingredients", "recipe_already_known",
      "recipe_locked", "not_enough_farm_items", "not_enough_fishing_items", "not_enough_kitchen_items",
      "not_enough_cooking_prep_sets",
      "not_enough_gold", "specialty_locked", "specialty_permanent", "delivery_completed",
      "food_not_eligible", "cooked_food_unavailable", "standing_delivery_limit",
    ]);
    if (code === "bad_request" || code.startsWith("invalid_")) return Response.json({ ok: false, error: code }, { status: 400 });
    if (conflict.has(code)) return Response.json({ ok: false, error: code }, { status: 409 });
    throw error;
  }
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as { recipeId?: unknown } | null;
  return POST(new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ action: "favorite", recipeId: body?.recipeId }) }));
}
