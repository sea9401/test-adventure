import { db } from "@/db";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  acknowledgeReadyFarmPlots,
  emptyFarmReadyNotificationState,
} from "@/adventure/v2/farmReadyNotification";
import {
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
} from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
} from "@/lib/server/savesKv";

// 농장 화면이나 수확 알림을 확인하면 현재 다 자란 밭을 확인한 것으로 기록한다.
// 밭별 plantedAt 을 저장하므로 이후 새로 심은 작물이 자라면 다시 한 건만 알린다.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const acknowledgedCount = await db.transaction(async (tx) => {
    const notificationRaw = await lockSaveForUpdate(
      tx,
      userId,
      FARM_READY_NOTIFICATION_SAVE_KEY,
      emptyFarmReadyNotificationState(),
    );
    const farm = parseFarmState(
      await readSave(tx, userId, FARM_SAVE_KEY, emptyFarmState(now)),
    );
    const acknowledged = acknowledgeReadyFarmPlots(farm, notificationRaw, now);
    if (acknowledged.acknowledgedCount > 0) {
      await upsertSave(
        tx,
        userId,
        FARM_READY_NOTIFICATION_SAVE_KEY,
        acknowledged.state,
      );
    }
    return acknowledged.acknowledgedCount;
  });

  return Response.json({ ok: true, acknowledgedCount });
}
