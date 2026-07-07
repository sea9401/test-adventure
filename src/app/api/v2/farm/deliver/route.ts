import { db } from "@/db";
import {
  FARM_CROP_LIST,
  FARM_SAVE_KEY,
  FarmError,
  claimFarmDelivery,
  emptyFarmState,
  getFarmDeliveryRequests,
  normalizeFarmForDay,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

// POST /api/v2/farm/deliver — 오늘의 농장 납품을 완료한다.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    requestId?: unknown;
  } | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  if (!requestId) {
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
      const delivered = claimFarmDelivery(farm, requestId, now);
      await upsertSave(tx, userId, FARM_SAVE_KEY, delivered.state);
      return { farm: delivered.state, result: delivered.result };
    });
    return Response.json({
      ok: true,
      now,
      farm,
      crops: FARM_CROP_LIST,
      deliveries: getFarmDeliveryRequests(),
      deliveryResult: result,
    });
  } catch (e) {
    if (e instanceof FarmError) {
      return Response.json({ ok: false, error: e.code }, { status: 409 });
    }
    throw e;
  }
}
