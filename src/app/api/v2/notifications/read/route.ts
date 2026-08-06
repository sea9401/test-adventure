import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// POST /api/v2/notifications/read — 기본은 일반 미읽음 전체, notificationId를 보내면 해당 건만 처리.

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let notificationId: number | null = null;
  try {
    const body = (await req.json()) as { notificationId?: unknown };
    const parsed = Number(body.notificationId);
    if (Number.isInteger(parsed) && parsed > 0) notificationId = parsed;
  } catch {
    // 본문 없는 기존 호출은 일반 알림 전체 읽음 처리.
  }

  await db
    .update(v2Notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(v2Notifications.userId, userId),
        isNull(v2Notifications.readAt),
        ...(notificationId != null
          ? [eq(v2Notifications.id, notificationId)]
          : []),
      ),
    );

  return Response.json({ ok: true });
}
