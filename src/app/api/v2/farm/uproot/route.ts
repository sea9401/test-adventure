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
  normalizeFarmForDay,
  parseFarmState,
  uprootCrop,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { enforceFarmingRateLimit } from "@/lib/server/farmingRateLimit";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const guarded = enforceFarmingRateLimit(request, userId);
  if (guarded) return guarded;

  const body = (await request.json().catch(() => null)) as {
    plotId?: unknown;
  } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const farm = await db.transaction(async (tx) => {
      const current = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
        ),
        now,
      );
      const next = uprootCrop(current, plotId, now);
      await upsertSave(tx, userId, FARM_SAVE_KEY, next);
      return next;
    });

    return Response.json({
      ok: true,
      now,
      farm,
      uprootedPlotId: plotId,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      specialDeliveries: getFarmSpecialDeliveryRequests(),
      weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
      shopItems: getFarmShopItems(),
    });
  } catch (error) {
    if (error instanceof FarmError) {
      return Response.json(
        { ok: false, error: error.code },
        { status: error.code === "plot_not_found" ? 404 : 409 },
      );
    }
    throw error;
  }
}
