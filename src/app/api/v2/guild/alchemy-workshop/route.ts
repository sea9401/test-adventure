import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import {
  GUILD_ALCHEMY_RECIPES,
  guildAlchemyChargeGain,
  guildAlchemyRecipe,
  isGuildAlchemyChargeTarget,
  parseGuildAlchemyWeeklyState,
  type GuildAlchemyWeeklyState,
} from "@/adventure/data/v2/guildAlchemy";
import { alchemyWorkshopUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { ensureUser } from "@/lib/server/ensureUser";
import { recordEconomyEventSoon, recordRewardFailureSoon } from "@/lib/server/economyLog";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { buildingLevelFromSlots } from "@/lib/server/settlementBuildingAccess";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { kstWeekMondayKey } from "@/lib/kst";
import { MAX_CHARGE } from "@/lib/v2-charge-config";

type InventorySave = Record<string, unknown> & {
  hpCharges?: unknown;
  mpCharges?: unknown;
  guildAlchemyWeekly?: unknown;
};

type CraftBody = {
  recipeId?: unknown;
  target?: unknown;
  quantity?: unknown;
};

function safeCharge(value: unknown): number {
  const parsed = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(MAX_CHARGE, parsed));
}

async function alchemyWorkshopLevel(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  guildId: number,
): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (level, row) =>
      Math.max(level, buildingLevelFromSlots(row.buildings, "alchemy_workshop")),
    0,
  );
}

function workshopView(params: {
  level: number;
  farm: FarmState;
  inventory: InventorySave;
  weekKey: string;
}) {
  const { level, farm, inventory, weekKey } = params;
  const weekly = parseGuildAlchemyWeeklyState(
    inventory.guildAlchemyWeekly,
    weekKey,
  );
  const upgrade = alchemyWorkshopUpgradeForLevel(level);
  const energyLimit = upgrade.weeklyEnergy;
  return {
    level,
    stageLabel: upgrade.label,
    weekKey,
    weeklyEnergy: {
      used: weekly.energyUsed,
      limit: energyLimit,
      remaining: Math.max(0, energyLimit - weekly.energyUsed),
    },
    materials: {
      herb: farm.inventory.herb ?? 0,
      silverleaf: farm.inventory.silverleaf ?? 0,
    },
    charges: {
      hp: safeCharge(inventory.hpCharges),
      mp: safeCharge(inventory.mpCharges),
      max: MAX_CHARGE,
    },
    recipes: GUILD_ALCHEMY_RECIPES.map((recipe) => ({
      ...recipe,
      unlocked: level >= recipe.minFacilityLevel,
    })),
  };
}

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const level = await alchemyWorkshopLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "alchemy_workshop_required" },
      };
    }
    const now = new Date();
    const [farmRaw, inventory] = await Promise.all([
      readSave(tx, userId, FARM_SAVE_KEY, emptyFarmState(now.getTime())),
      readSave<InventorySave>(tx, userId, "inventory.v2", {}),
    ]);
    return {
      status: 200,
      body: {
        ok: true as const,
        ...workshopView({
          level,
          farm: parseFarmState(farmRaw),
          inventory,
          weekKey: kstWeekMondayKey(now),
        }),
      },
    };
  });
  return Response.json(result.body, { status: result.status });
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:guild:alchemy-workshop:craft",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let body: CraftBody;
  try {
    body = (await req.json()) as CraftBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const recipe = guildAlchemyRecipe(body.recipeId);
  const target = isGuildAlchemyChargeTarget(body.target) ? body.target : null;
  const quantity = Number(body.quantity);
  if (!recipe || !target || !Number.isInteger(quantity) || quantity < 1 || quantity > 15) {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const now = new Date();
  const weekKey = kstWeekMondayKey(now);
  const result = await db.transaction(async (tx) => {
    const guildId = await getGuildId(tx, userId);
    if (guildId == null) {
      return { status: 403, body: { ok: false as const, error: "no_guild" } };
    }
    const level = await alchemyWorkshopLevel(tx, guildId);
    if (level <= 0) {
      return {
        status: 403,
        body: { ok: false as const, error: "alchemy_workshop_required" },
      };
    }
    if (level < recipe.minFacilityLevel) {
      return { status: 409, body: { ok: false as const, error: "recipe_locked" } };
    }

    // 락 순서: farm.v2 → inventory.v2. 재료 차감과 충전 지급을 한 트랜잭션으로 묶는다.
    const farmRaw = await lockSaveForUpdate(
      tx,
      userId,
      FARM_SAVE_KEY,
      emptyFarmState(now.getTime()),
    );
    const inventory = await lockSaveForUpdate<InventorySave>(
      tx,
      userId,
      "inventory.v2",
      {},
    );
    const farm = parseFarmState(farmRaw);
    const weekly = parseGuildAlchemyWeeklyState(
      inventory.guildAlchemyWeekly,
      weekKey,
    );
    const energyLimit = alchemyWorkshopUpgradeForLevel(level).weeklyEnergy;
    const energyCost = recipe.energyCost * quantity;
    if (weekly.energyUsed + energyCost > energyLimit) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_energy",
          remaining: Math.max(0, energyLimit - weekly.energyUsed),
        },
      };
    }

    const herbCost = recipe.ingredients.herb * quantity;
    const silverleafCost = recipe.ingredients.silverleaf * quantity;
    if (
      (farm.inventory.herb ?? 0) < herbCost ||
      (farm.inventory.silverleaf ?? 0) < silverleafCost
    ) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "insufficient_materials",
          required: { herb: herbCost, silverleaf: silverleafCost },
        },
      };
    }

    const gain = guildAlchemyChargeGain(recipe, target, quantity);
    const hpCharges = safeCharge(inventory.hpCharges);
    const mpCharges = safeCharge(inventory.mpCharges);
    if (hpCharges + gain.hp > MAX_CHARGE || mpCharges + gain.mp > MAX_CHARGE) {
      return {
        status: 409,
        body: {
          ok: false as const,
          error: "charge_capacity",
          room: { hp: MAX_CHARGE - hpCharges, mp: MAX_CHARGE - mpCharges },
        },
      };
    }

    const nextFarm: FarmState = {
      ...farm,
      inventory: { ...farm.inventory },
    };
    const nextHerb = (nextFarm.inventory.herb ?? 0) - herbCost;
    const nextSilverleaf = (nextFarm.inventory.silverleaf ?? 0) - silverleafCost;
    if (nextHerb > 0) nextFarm.inventory.herb = nextHerb;
    else delete nextFarm.inventory.herb;
    if (nextSilverleaf > 0) nextFarm.inventory.silverleaf = nextSilverleaf;
    else delete nextFarm.inventory.silverleaf;

    const nextWeekly: GuildAlchemyWeeklyState = {
      weekKey,
      energyUsed: weekly.energyUsed + energyCost,
    };
    const nextInventory: InventorySave = {
      ...inventory,
      hpCharges: hpCharges + gain.hp,
      mpCharges: mpCharges + gain.mp,
      guildAlchemyWeekly: nextWeekly,
    };
    await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
    await upsertSave(tx, userId, "inventory.v2", nextInventory);
    await logGuildActivity(tx, {
      guildId,
      type: "alchemy_craft",
      actorUserId: userId,
      meta: {
        itemName: recipe.name,
        chargeTarget: target,
        chargeAmount: gain.total,
      },
    });

    return {
      status: 200,
      body: {
        ok: true as const,
        crafted: {
          recipeId: recipe.id,
          recipeName: recipe.name,
          target,
          quantity,
          hpCharged: gain.hp,
          mpCharged: gain.mp,
          totalCharged: gain.total,
        },
        ...workshopView({ level, farm: nextFarm, inventory: nextInventory, weekKey }),
      },
      guildId,
    };
  });

  if (result.status === 200 && result.body.ok) {
    const crafted = result.body.crafted;
    recordEconomyEventSoon({
      userId,
      eventType: "reward.guild_alchemy_charge",
      itemKind: "recovery_charge",
      itemId: crafted.target,
      quantity: crafted.totalCharged,
      detail: {
        guildId: result.guildId,
        recipeId: crafted.recipeId,
        quantity: crafted.quantity,
        hpCharged: crafted.hpCharged,
        mpCharged: crafted.mpCharged,
      },
    });
  } else if (!result.body.ok) {
    recordRewardFailureSoon({
      userId,
      source: "guild_alchemy",
      error: result.body.error,
      detail: { recipeId: recipe.id, target, quantity, status: result.status },
    });
  }
  return Response.json(result.body, { status: result.status });
}
