import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLog, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/audit-log — 최근 관리자 행동 로그(최신순). requireAdmin 게이트.
//   ?limit=  (기본 100, 최대 500)
//   ?targetUserId=  특정 대상 유저로 필터(선택)
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);
  const targetUserId = sp.get("targetUserId");

  const rows = await db
    .select({
      id: adminAuditLog.id,
      adminEmail: adminAuditLog.adminEmail,
      action: adminAuditLog.action,
      targetUserId: adminAuditLog.targetUserId,
      targetGameName: users.gameName,
      detail: adminAuditLog.detail,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.targetUserId))
    .where(targetUserId ? eq(adminAuditLog.targetUserId, targetUserId) : undefined)
    .orderBy(desc(adminAuditLog.id))
    .limit(limit);

  return Response.json({ ok: true, entries: rows });
}
