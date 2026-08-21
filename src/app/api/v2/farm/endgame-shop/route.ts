import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  emptyFarmState,
  farmAvailableReputation,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  farmEndgameShopItem,
  farmEndgameShopProgress,
  farmEndgameShopView,
  type FarmEndgameShopPurchaseResult,
} from "@/adventure/v2/farmEndgameShop";
import {
  LIFE_WORKSHOP_SAVE_KEY,
  emptyLifeWorkshopState,
  parseLifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import {
  grantTitleIfMissingInTx,
  ownedTitleIdsOf,
} from "@/lib/server/grantTitle";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

type PurchaseError =
  | "endgame_shop_locked"
  | "not_enough_reputation"
  | "already_owned";

// POST /api/v2/farm/endgame-shop — 완성된 농장의 증표를 후반 상품으로 교환한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  if (typeof body?.itemId !== "string" || body.itemId.length === 0) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const item = farmEndgameShopItem(body.itemId);
  if (!item) {
    return Response.json(
      { ok: false, error: "shop_item_not_found" },
      { status: 400 },
    );
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    const farm = normalizeFarmForDay(
      parseFarmState(
        await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
        now,
      ),
      now,
    );
    if (!farmEndgameShopProgress(farm).unlocked) {
      return { ok: false as const, error: "endgame_shop_locked" as const };
    }
    if (farmAvailableReputation(farm) < item.costReputation) {
      return { ok: false as const, error: "not_enough_reputation" as const };
    }

    let nextFarm = farm;
    if (item.reward.kind === "farmItem") {
      nextFarm = {
        ...nextFarm,
        inventory: {
          ...nextFarm.inventory,
          compound_feed:
            (nextFarm.inventory.compound_feed ?? 0) + item.reward.quantity,
        },
      };
    } else if (item.reward.kind === "finishedItem") {
      const workshop = parseLifeWorkshopState(
        await lockSaveForUpdate(
          tx,
          userId,
          LIFE_WORKSHOP_SAVE_KEY,
          emptyLifeWorkshopState(),
        ),
      );
      const nextWorkshop = {
        ...workshop,
        crafting: {
          ...workshop.crafting,
          balances: {
            ...workshop.crafting.balances,
            organic_fertilizer:
              (workshop.crafting.balances.organic_fertilizer ?? 0) +
              item.reward.quantity,
          },
        },
      };
      await upsertSave(tx, userId, LIFE_WORKSHOP_SAVE_KEY, nextWorkshop);
    } else if (
      !(await grantTitleIfMissingInTx(tx, userId, item.reward.titleId, now))
    ) {
      return { ok: false as const, error: "already_owned" as const };
    }

    nextFarm = {
      ...nextFarm,
      stats: {
        ...nextFarm.stats,
        reputationSpent: nextFarm.stats.reputationSpent + item.costReputation,
      },
    };
    await upsertSave(tx, userId, FARM_SAVE_KEY, nextFarm);

    const workshop = parseLifeWorkshopState(
      await lockSaveForUpdate(
        tx,
        userId,
        LIFE_WORKSHOP_SAVE_KEY,
        emptyLifeWorkshopState(),
      ),
    );
    const adventureLog = await lockSaveForUpdate(tx, userId, "adventure-log.v2", {});
    const endgameShopResult: FarmEndgameShopPurchaseResult = {
      itemId: item.id,
      title: item.title,
      rewardText: item.rewardText,
      costReputation: item.costReputation,
    };

    return {
      ok: true as const,
      farm: nextFarm,
      fertilizerBalance: workshop.crafting.balances.organic_fertilizer ?? 0,
      endgameShop: farmEndgameShopView(nextFarm, ownedTitleIdsOf(adventureLog)),
      endgameShopResult,
    };
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error satisfies PurchaseError },
      { status: 409 },
    );
  }

  return Response.json({
    now,
    ...result,
    crops: FARM_CROP_LIST,
    deliveries: getFarmDeliveryRequests(),
    specialDeliveries: getFarmSpecialDeliveryRequests(),
    weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
    shopItems: getFarmShopItems(),
  });
}
