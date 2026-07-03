import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/abuse-log — 운영 이상 행동 로그 최신순.
//   ?limit=  기본 200, 최대 1000
//   ?userId= / ?ip= / ?action= 선택 필터
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);
  const userId = sp.get("userId")?.trim() || null;
  const ip = sp.get("ip")?.trim() || null;
  const action = sp.get("action")?.trim() || null;

  const filters = [
    userId ? eq(abuseEvents.userId, userId) : undefined,
    ip ? eq(abuseEvents.ip, ip) : undefined,
    action ? eq(abuseEvents.action, action) : undefined,
  ].filter((v): v is Exclude<typeof v, undefined> => v !== undefined);

  const rows = await db
    .select({
      id: abuseEvents.id,
      userId: abuseEvents.userId,
      gameName: users.gameName,
      ip: abuseEvents.ip,
      action: abuseEvents.action,
      reason: abuseEvents.reason,
      detail: abuseEvents.detail,
      createdAt: abuseEvents.createdAt,
    })
    .from(abuseEvents)
    .leftJoin(users, eq(users.id, abuseEvents.userId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(abuseEvents.id))
    .limit(limit);

  return Response.json({ ok: true, entries: rows });
}
