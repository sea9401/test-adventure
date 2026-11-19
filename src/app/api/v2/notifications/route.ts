import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import {
  FARM_READY_NOTIFICATION_SAVE_KEY,
  createFarmReadyNotification,
  emptyFarmReadyNotificationState,
} from "@/adventure/v2/farmReadyNotification";
import { FARM_SAVE_KEY, emptyFarmState } from "@/adventure/v2/farm";
import { PEDDLER_SAVE_KEY } from "@/adventure/v2/peddler";
import {
  PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY,
  createPeddlerArrivalNotification,
} from "@/adventure/v2/peddlerArrivalNotification";
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

  const [
    [{ unreadCount: storedUnreadCount }],
    farmRaw,
    farmNotificationRaw,
    peddlerRaw,
    peddlerNotificationRaw,
  ] = await Promise.all([
      db
        .select({ unreadCount: sql<number>`count(*)::int` })
        .from(v2Notifications)
        .where(
          and(
            eq(v2Notifications.userId, userId),
            isNull(v2Notifications.readAt),
            ne(v2Notifications.type, "lottery_won"),
          ),
        ),
      readSave(db, userId, FARM_SAVE_KEY, emptyFarmState(now)),
      readSave(
        db,
        userId,
        FARM_READY_NOTIFICATION_SAVE_KEY,
        emptyFarmReadyNotificationState(),
      ),
      readSave(db, userId, PEDDLER_SAVE_KEY, {}),
      readSave(db, userId, PEDDLER_ARRIVAL_NOTIFICATION_SAVE_KEY, {}),
    ]);
  const farmReadyNotification = createFarmReadyNotification(
    farmRaw,
    farmNotificationRaw,
    now,
  );
  // 저장된 행 없이 읽을 때 만드는 알림. 농장 수확과 행상 도착이 각각 최대 한 건이다.
  const dynamicNotifications = [
    farmReadyNotification,
    createPeddlerArrivalNotification(peddlerRaw, peddlerNotificationRaw, now),
  ].filter((entry): entry is V2NotificationEntry => entry !== null);
  const unreadCount = storedUnreadCount + dynamicNotifications.length;
  if (countOnly) {
    return Response.json({ ok: true, unreadCount });
  }

  const rows = await db
    .select()
    .from(v2Notifications)
    .where(
      and(
        eq(v2Notifications.userId, userId),
        ne(v2Notifications.type, "lottery_won"),
      ),
    )
    .orderBy(desc(v2Notifications.id))
    .limit(NOTIF_FETCH_LIMIT - dynamicNotifications.length);

  const storedNotifications: V2NotificationEntry[] = rows.map((r) => ({
    id: r.id,
    type: r.type as V2NotificationEntry["type"],
    payload: r.payload as V2NotificationEntry["payload"],
    readAt: r.readAt ? r.readAt.getTime() : null,
    createdAt: r.createdAt.getTime(),
  }));
  const notifications = [...dynamicNotifications, ...storedNotifications].sort((a, b) => b.createdAt - a.createdAt);

  return Response.json({ ok: true, notifications, unreadCount });
}
