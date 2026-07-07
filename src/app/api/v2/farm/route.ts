import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  emptyFarmState,
  getFarmDeliveryRequests,
  getFarmShopItems,
  getFarmSpecialDeliveryRequests,
  getFarmWeeklyDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";

// GET /api/v2/farm — 모험가 농장 상태.
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const farm = normalizeFarmForDay(
    parseFarmState(
      await readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    ),
    now,
  );
  return Response.json({
    ok: true,
    now,
    farm,
    crops: FARM_CROP_LIST,
    deliveries: getFarmDeliveryRequests(),
    specialDeliveries: getFarmSpecialDeliveryRequests(),
    weeklyDeliveries: getFarmWeeklyDeliveryRequests(),
    shopItems: getFarmShopItems(),
  });
}
