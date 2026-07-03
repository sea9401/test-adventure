import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

// GET /api/admin/abuse-log — 운영 이상 행동 로그 최신순.
//   ?limit=  기본 200, 최대 1000
//   ?userId= / ?ip= / ?action= / ?reason= / ?since= / ?until= 선택 필터
//   ?format=csv 이면 CSV 다운로드용 text/csv 응답
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);
  const userId = sp.get("userId")?.trim() || null;
  const ip = sp.get("ip")?.trim() || null;
  const action = sp.get("action")?.trim() || null;
  const reason = sp.get("reason")?.trim() || null;
  const since = parseDateParam(sp.get("since"));
  const until = parseDateParam(sp.get("until"));
  const format = sp.get("format");

  const filters: SQL[] = [];
  if (userId) filters.push(eq(abuseEvents.userId, userId));
  if (ip) filters.push(eq(abuseEvents.ip, ip));
  if (action) filters.push(eq(abuseEvents.action, action));
  if (reason) filters.push(eq(abuseEvents.reason, reason));
  if (since) filters.push(gte(abuseEvents.createdAt, since));
  if (until) filters.push(lte(abuseEvents.createdAt, until));

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

  if (format === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="abuse-log.csv"`,
      },
    });
  }

  return Response.json({ ok: true, entries: rows });
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function csvCell(value: unknown): string {
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : value == null
          ? ""
          : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const cols = ["id", "createdAt", "userId", "gameName", "ip", "action", "reason", "detail"];
  return [
    cols.join(","),
    ...rows.map((row) => cols.map((col) => csvCell(row[col])).join(",")),
  ].join("\n");
}
