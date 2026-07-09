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
  plantCrop,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { V2_JOB_CATALOG, jobIdFromLegacy } from "@/adventure/data/v2/v2JobCatalog";

// POST /api/v2/farm/plant — 빈 밭에 기본 씨앗을 심는다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    plotId?: unknown;
    cropId?: unknown;
  } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  const cropId = body?.cropId;
  if (!plotId || !isFarmCropId(cropId)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm: next, farmJobId } = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<Record<string, unknown>>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const farmJobId = currentJobIdFromChar(charSave);
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
        ),
        now,
      );
      const planted = plantCrop(farm, plotId, cropId, now, {
        currentJobId: farmJobId,
      });
      await upsertSave(tx, userId, FARM_SAVE_KEY, planted);
      return { farm: planted, farmJobId };
    });
    return Response.json({
      ok: true,
      now,
      farm: next,
      farmJobId,
      farmJobName: farmJobId ? V2_JOB_CATALOG[farmJobId]?.name ?? farmJobId : null,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}

function currentJobIdFromChar(charSave: Record<string, unknown>): string | null {
  const cls = parseV2Class(charSave.class);
  return jobIdFromLegacy(
    cls,
    typeof charSave.specChoice === "string" ? charSave.specChoice : null,
  );
}
