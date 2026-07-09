import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  FarmError,
  emptyFarmState,
  getFarmDeliveryRequests,
  harvestPlot,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/farm/harvest — 다 자란 밭을 수확한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { plotId?: unknown } | null;
  const plotId = typeof body?.plotId === "string" ? body.plotId : "";
  if (!plotId) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const now = Date.now();
    const { farm, result } = await db.transaction(async (tx) => {
      const farm = normalizeFarmForDay(
        parseFarmState(
          await lockSaveForUpdate(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
        ),
        now,
      );
      const harvested = harvestPlot(farm, plotId, now, Math.random);
      await upsertSave(tx, userId, FARM_SAVE_KEY, harvested.state);
      return { farm: harvested.state, result: harvested.result };
    });
    return Response.json({
      ok: true,
      now,
      farm,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      result,
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}
