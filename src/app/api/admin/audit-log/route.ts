import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLog, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/audit-log — 최근 관리자 행동 로그(최신순). requireAdmin 게이트.
//   ?limit=  (기본 100, 최대 500)
//   ?targetUserId= / ?adminEmail= / ?action= / ?since= / ?until= 선택 필터
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);
  const targetUserId = sp.get("targetUserId")?.trim() || null;
  const adminEmail = sp.get("adminEmail")?.trim().toLowerCase() || null;
  const action = sp.get("action")?.trim() || null;
  const since = parseDateParam(sp.get("since"));
  const until = parseDateParam(sp.get("until"));

  const filters: SQL[] = [];
  if (targetUserId) filters.push(eq(adminAuditLog.targetUserId, targetUserId));
  if (adminEmail) filters.push(eq(adminAuditLog.adminEmail, adminEmail));
  if (action) filters.push(eq(adminAuditLog.action, action));
  if (since) filters.push(gte(adminAuditLog.createdAt, since));
  if (until) filters.push(lte(adminAuditLog.createdAt, until));

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
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(adminAuditLog.id))
    .limit(limit);

  return Response.json({ ok: true, entries: rows });
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
