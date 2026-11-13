import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  FarmError,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  isFarmCropId,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import {
  breedFarmCrop,
  farmBreedingEarnedTitleIds,
} from "@/adventure/v2/farmBreeding";
import { LIFE_MAJOR_SAVE_KEY } from "@/adventure/v2/lifeMajor";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  FARM_BREEDING_MASTER_CROP_ID,
  farmBreedingContextFromSaves,
} from "@/lib/server/farmBreeding";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { grantTitleIfMissingInTx } from "@/lib/server/grantTitle";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/farm/breed — { cropId } 작물을 써서 그 작물의 품종 단계를 한 단계 올린다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as { cropId?: unknown } | null;
  const cropId = body?.cropId;
  if (!isFarmCropId(cropId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm, result, breeding } = await db.transaction(async (tx) => {
      // 수확 요청과 같은 순서(character.v2 → farm.v2)로 잠근다.
      const character = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
          now,
        ),
        now,
      );
      const context = farmBreedingContextFromSaves(
        character,
        await readSave(tx, userId, LIFE_MAJOR_SAVE_KEY, {}),
      );
      const earnedBefore = new Set(farmBreedingEarnedTitleIds(farm));
      const bred = breedFarmCrop(farm, cropId, context);

      let masterCropHeld = context.masterCropHeld;
      if (bred.result.cost.masterCrop > 0) {
        masterCropHeld -= bred.result.cost.masterCrop;
        const materials = {
          ...((character.materials ?? {}) as Record<string, number>),
        };
        if (masterCropHeld > 0) materials[FARM_BREEDING_MASTER_CROP_ID] = masterCropHeld;
        else delete materials[FARM_BREEDING_MASTER_CROP_ID];
        await upsertSave(tx, userId, "character.v2", { ...character, materials });
      }
      await upsertSave(tx, userId, FARM_SAVE_KEY, bred.state);

      const grantedTitleIds: string[] = [];
      for (const titleId of farmBreedingEarnedTitleIds(bred.state)) {
        if (earnedBefore.has(titleId)) continue;
        if (await grantTitleIfMissingInTx(tx, userId, titleId, now)) {
          grantedTitleIds.push(titleId);
        }
      }
      return {
        farm: bred.state,
        result: { ...bred.result, grantedTitleIds },
        breeding: { masterUnlocked: context.masterUnlocked, masterCropHeld },
      };
    });
    return Response.json({
      ok: true,
      now,
      farm,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
      breeding,
      breedResult: result,
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}
