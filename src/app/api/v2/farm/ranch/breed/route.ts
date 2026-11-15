// POST /api/v2/farm/ranch/breed — { slotId } 그 칸의 가축을 교배해 혈통 등급을 올려 본다.

import { db } from "@/db";
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
} from "@/adventure/v2/farm";
import { LIFE_MAJOR_SAVE_KEY } from "@/adventure/v2/lifeMajor";
import { isRanchSlotId } from "@/adventure/v2/ranch";
import { breedFarmRanchSlot } from "@/adventure/v2/ranchLineage";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  FARM_BREEDING_MASTER_CROP_ID,
  farmBreedingContextFromSaves,
} from "@/lib/server/farmBreeding";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as { slotId?: unknown } | null;
  const slotId = body?.slotId;
  if (!isRanchSlotId(slotId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const result = await db.transaction(async (tx) => {
      // 품종 개량과 같은 순서(character.v2 → farm.v2)로 잠근다.
      const character = await lockSaveForUpdate<Record<string, unknown>>(tx, userId, "character.v2", {});
      const farm = normalizeFarmForDay(
        parseFarmState(await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)), now),
        now,
      );
      const skills = parseV2SkillsState(await readSave(tx, userId, "skills.v2", emptyV2SkillsState()));
      if (!skills.learned.includes(FARM_CROP_REQUIRED_SKILL_ID)) {
        return { ok: false as const, error: "ranch_locked" as const };
      }
      // 명장 혈통 조건은 명장 품종과 같다(농사 주전공 명장 3단계, 명장 작물).
      const context = farmBreedingContextFromSaves(
        character,
        await readSave(tx, userId, LIFE_MAJOR_SAVE_KEY, {}),
      );
      const bred = breedFarmRanchSlot(farm, slotId, context, Math.random, now);

      let masterCropHeld = context.masterCropHeld;
      if (bred.result.cost.masterCrop > 0) {
        masterCropHeld -= bred.result.cost.masterCrop;
        const materials = { ...((character.materials ?? {}) as Record<string, number>) };
        if (masterCropHeld > 0) materials[FARM_BREEDING_MASTER_CROP_ID] = masterCropHeld;
        else delete materials[FARM_BREEDING_MASTER_CROP_ID];
        await upsertSave(tx, userId, "character.v2", { ...character, materials });
      }
      await upsertSave(tx, userId, FARM_SAVE_KEY, bred.state);
      return {
        ok: true as const,
        farm: bred.state,
        learnedSkillIds: skills.learned,
        ranchBreedResult: bred.result,
        breeding: { masterUnlocked: context.masterUnlocked, masterCropHeld },
      };
    });
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });
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
    if (error instanceof FarmError) {
      return Response.json({ ok: false, error: error.code }, { status: 409 });
    }
    throw error;
  }
}
