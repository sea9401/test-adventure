import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
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

  const [{ unreadCount }] = await db
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(v2Notifications)
    .where(
      and(eq(v2Notifications.userId, userId), isNull(v2Notifications.readAt)),
    );
  if (countOnly) {
    return Response.json({ ok: true, unreadCount });
  }

  const rows = await db
    .select()
    .from(v2Notifications)
    .where(eq(v2Notifications.userId, userId))
    .orderBy(desc(v2Notifications.id))
    .limit(NOTIF_FETCH_LIMIT);

  const notifications: V2NotificationEntry[] = rows.map((r) => ({
    id: r.id,
    type: r.type as V2NotificationEntry["type"],
    payload: r.payload as V2NotificationEntry["payload"],
    readAt: r.readAt ? r.readAt.getTime() : null,
    createdAt: r.createdAt.getTime(),
  }));

  return Response.json({ ok: true, notifications, unreadCount });
}
