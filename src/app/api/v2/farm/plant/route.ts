import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_MAX_PLOT_COUNT,
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
  plantCrops,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";

// POST /api/v2/farm/plant — 빈 밭에 기본 씨앗을 심는다.
// plotId 하나 또는 plotIds 목록(모두 심기)을 받아 한 트랜잭션에서 처리한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(req, userId);
  if (guarded) return guarded;

  const body = (await req.json().catch(() => null)) as {
    plotId?: unknown;
    plotIds?: unknown;
    cropId?: unknown;
  } | null;
  const plotIds = parsePlotIds(body);
  const cropId = body?.cropId;
  if (!plotIds || !isFarmCropId(cropId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm: next, learnedSkillIds, planted, stoppedError } = await db.transaction(async (tx) => {
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
      const result = plantCrops(farm, plotIds, cropId, now, {
        learnedSkillIds: skills.learned,
      });
      await upsertSave(tx, userId, FARM_SAVE_KEY, result.state);
      return {
        farm: result.state,
        learnedSkillIds: skills.learned,
        planted: result.planted,
        stoppedError: result.stoppedError,
      };
    });
    return Response.json({
      ok: true,
      now,
      farm: next,
      learnedSkillIds,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
      result: { planted, stoppedError },
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}

function parsePlotIds(
  body: { plotId?: unknown; plotIds?: unknown } | null,
): string[] | null {
  if (Array.isArray(body?.plotIds)) {
    const ids = [...new Set(body.plotIds)];
    if (
      ids.length === 0 ||
      ids.length > FARM_MAX_PLOT_COUNT ||
      !ids.every((id): id is string => typeof id === "string" && id.length > 0)
    ) {
      return null;
    }
    return ids;
  }
  return typeof body?.plotId === "string" && body.plotId ? [body.plotId] : null;
}
