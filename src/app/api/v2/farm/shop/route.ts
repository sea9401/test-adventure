import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  FarmError,
  buyFarmShopItem,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/farm/shop — 농장 증표로 씨앗 상자를 구매한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    itemId?: unknown;
  } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm, result, learnedSkillIds } = await db.transaction(async (tx) => {
      const skills = parseV2SkillsState(
        await lockSaveForUpdate(
          tx,
          userId,
          "skills.v2",
          emptyV2SkillsState(),
        ),
      );
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
        ),
        now,
      );
      const purchase = buyFarmShopItem(farm, itemId, {
        learnedSkillIds: skills.learned,
      });
      await upsertSave(tx, userId, FARM_SAVE_KEY, purchase.state);
      return {
        farm: purchase.state,
        result: purchase.result,
        learnedSkillIds: skills.learned,
      };
    });
    return Response.json({
      ok: true,
      now,
      farm,
      learnedSkillIds,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
      shopResult: result,
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}
