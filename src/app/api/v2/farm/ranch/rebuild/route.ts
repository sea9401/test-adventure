import { emptyV2SkillsState, parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  FARM_CROP_LIST,
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  FarmError,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
  rebuildFarmRanchSlot,
} from "@/adventure/v2/farm";
import {
  RanchError,
  isRanchAnimalId,
  isRanchSlotId,
} from "@/adventure/v2/ranch";
import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = await req.json().catch(() => null) as {
    slotId?: unknown;
    animalId?: unknown;
  } | null;
  if (!isRanchSlotId(body?.slotId) || !isRanchAnimalId(body?.animalId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const { slotId, animalId } = body;
  const now = Date.now();

  try {
    const result = await db.transaction(async (tx) => {
      const skills = parseV2SkillsState(
        await lockSaveForUpdate(tx, userId, "skills.v2", emptyV2SkillsState()),
      );
      if (!skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID)) {
        return { ok: false as const, error: "ranch_locked" as const };
      }
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
          now,
        ),
        now,
      );
      const rebuilt = rebuildFarmRanchSlot(farm, slotId, animalId, now);
      await upsertSave(tx, userId, FARM_SAVE_KEY, rebuilt.state);
      return {
        ok: true as const,
        farm: rebuilt.state,
        learnedSkillIds: skills.learned,
        ranchRebuildResult: rebuilt.result,
      };
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
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
  } catch (error) {
    if (error instanceof FarmError || error instanceof RanchError) {
      return Response.json(
        {
          ok: false,
          error: error instanceof FarmError ? error.code : error.message,
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
