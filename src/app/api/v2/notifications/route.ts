import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  createFarmReadyNotification,
  emptyFarmReadyNotificationState,
} from "@/adventure/v2/farmReadyNotification";
import { FARM_SAVE_KEY, emptyFarmState } from "@/adventure/v2/farm";
import { ensureUser } from "@/lib/server/ensureUser";
import { readSave } from "@/lib/server/savesKv";
import {
  NOTIF_FETCH_LIMIT,
  type V2NotificationEntry,
} from "@/lib/v2-notification-config";

// GET /api/v2/notifications — 내 알림.
//   기본: { ok, notifications: V2NotificationEntry[](최근 NOTIF_FETCH_LIMIT), unreadCount }
//   ?count=1: { ok, unreadCount } 만 — Bell 뱃지 폴링용 경량 경로.

export async function GET(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const countOnly = new URL(req.url).searchParams.get("count") === "1";
  const now = Date.now();

  const [[{ unreadCount: storedUnreadCount }], farmRaw, farmNotificationRaw] =
    await Promise.all([
      db
        .select({ unreadCount: sql<number>`count(*)::int` })
        .from(v2Notifications)
        .where(
          and(
            eq(v2Notifications.userId, userId),
            isNull(v2Notifications.readAt),
          ),
        ),
      readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
      readSave(
        db,
        userId,
        FARM_READY_NOTIFICATION_SAVE_KEY,
        emptyFarmReadyNotificationState(),
      ),
    ]);
  const farmReadyNotification = createFarmReadyNotification(
    farmRaw,
    farmNotificationRaw,
    now,
  );
  const unreadCount = storedUnreadCount + (farmReadyNotification ? 1 : 0);
  if (countOnly) {
    return Response.json({ ok: true, unreadCount });
  }

  const rows = await db
    .select()
    .from(v2Notifications)
    .where(eq(v2Notifications.userId, userId))
    .orderBy(desc(v2Notifications.id))
    .limit(NOTIF_FETCH_LIMIT - (farmReadyNotification ? 1 : 0));

  const storedNotifications: V2NotificationEntry[] = rows.map((r) => ({
    id: r.id,
    type: r.type as V2NotificationEntry["type"],
    payload: r.payload as V2NotificationEntry["payload"],
    readAt: r.readAt ? r.readAt.getTime() : null,
    createdAt: r.createdAt.getTime(),
  }));
  const notifications = [
    ...(farmReadyNotification ? [farmReadyNotification] : []),
    ...storedNotifications,
  ].sort((a, b) => b.createdAt - a.createdAt);

  return Response.json({ ok: true, notifications, unreadCount });
}
