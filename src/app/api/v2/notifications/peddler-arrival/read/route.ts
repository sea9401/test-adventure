import { db } from "@/db";
import { PEDDLER_SAVE_KEY } from "@/adventure/v2/peddler";
import {
  PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY,
  acknowledgePeddlerArrivals,
} from "@/adventure/v2/peddlerArrivalNotification";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, readSave, upsertSave } from "@/lib/server/savesKv";

// 행상 화면이나 도착 알림을 확인하면 지금 도착해 있는 수레를 확인한 것으로 기록한다.
// 교역로별 출발 시각을 저장하므로 이후 다시 보낸 수레가 도착하면 새로 알린다.
export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const acknowledgedCount = await db.transaction(async (tx) => {
    const notificationRaw = await lockSaveForUpdate(tx, userId, PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY, {});
    const peddlerRaw = await readSave(tx, userId, PEDDLER_SAVE_KEY, {});
    const acknowledged = acknowledgePeddlerArrivals(peddlerRaw, notificationRaw, now);
    if (acknowledged.acknowledgedCount > 0) {
      await upsertSave(tx, userId, PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY, acknowledged.state);
    }
    return acknowledged.acknowledgedCount;
  });

  return Response.json({ ok: true, acknowledgedCount });
}
