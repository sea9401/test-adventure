import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceUserAndIpRateLimit } from "@/lib/server/userRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  emptyFarmState,
  normalizeFarmForDay,
  parseFarmState,
  spendFarmItems,
  type FarmItemId,
} from "@/adventure/v2/farm";
import {
  COOKING_SAVE_KEY,
  COOKING_SURPLUS_BATCH_SIZE,
  COOKING_SURPLUS_DAILY_LIMIT,
  emptyCookingState,
  parseCookingState,
} from "@/adventure/v2/cooking";

const NORMAL_CROP_IDS = new Set<FarmItemId>(
  FARM_CROP_LIST.map((crop) => crop.itemId),
);

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limited = enforceUserAndIpRateLimit(req, {
    userId,
    action: "v2:cooking:surplus",
    userLimit: 20,
    ipLimit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as {
    itemId?: unknown;
    batches?: unknown;
  } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId as FarmItemId : null;
  const batches = Math.max(0, Math.floor(Number(body?.batches) || 0));
  if (!itemId || !NORMAL_CROP_IDS.has(itemId) || batches < 1) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const now = Date.now();
  try {
    const result = await db.transaction(async (tx) => {
      const farm = normalizeFarmForDay(
        parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now))),
        now,
      );
      const cooking = parseCookingState(
        await lockSaveForUpdate(tx, userId, COOKING_SAVE_KEY, emptyCookingState(now)),
        now,
      );
      if (cooking.daily.surplusTrades + batches > COOKING_SURPLUS_DAILY_LIMIT) {
        throw new Error("daily_limit");
      }
      const quantity = batches * COOKING_SURPLUS_BATCH_SIZE;
      if ((farm.inventory[itemId] ?? 0) < quantity) throw new Error("not_enough_items");

      const nextFarm = {
        ...farm,
        inventory: spendFarmItems(farm.inventory, { [itemId]: quantity }),
        stats: { ...farm.stats, reputation: farm.stats.reputation + batches },
      };
      const nextCooking = {
        ...cooking,
        daily: {
          ...cooking.daily,
          surplusTrades: cooking.daily.surplusTrades + batches,
        },
      };
      await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);
      await upsertSave(tx, userId, COOKING_SAVE_KEY, nextCooking);
      return {
        itemId,
        quantity,
        reputationGained: batches,
        farm: nextFarm,
        cooking: nextCooking,
      };
    });
    return Response.json({ ok: true, now, result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "exchange_failed";
    if (code === "daily_limit" || code === "not_enough_items") {
      return Response.json({ ok: false, error: code }, { status: 409 });
    }
    throw error;
  }
}
