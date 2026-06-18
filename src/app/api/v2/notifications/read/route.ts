import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { v2Notifications } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";

// POST /api/v2/notifications/read — 내 미읽음 전체 읽음 처리.
// 알림 페이지 진입 시 호출 — 개별 읽음은 없음(읽고 끝 채널이라 단순 일괄).

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await db
    .update(v2Notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(v2Notifications.userId, userId), isNull(v2Notifications.readAt)),
    );

  return Response.json({ ok: true });
}
