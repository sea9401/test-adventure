import { desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import { readRewardFailureStatuses } from "@/lib/server/opsSettings";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 60, 1), 200);
  const format = sp.get("format") === "csv" ? "csv" : "json";
  if (q.length < 2) {
    if (format === "csv") {
      return new Response(csvRows([]), {
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
    }
    return Response.json({ ok: true, entries: [] });
  }

  const numericId = Number(q);
  const eventId = Number.isInteger(numericId) && numericId > 0 ? numericId : null;
  const pattern = `%${q}%`;
  const perLogLimit = Math.max(10, Math.ceil(limit / 2));

  const [abuseRows, economyRows, auditRows, rewardFailureStatuses] = await Promise.all([
    db
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
      .where(
        or(
          eventId ? eq(abuseEvents.id, eventId) : undefined,
          ilike(abuseEvents.action, pattern),
          ilike(abuseEvents.reason, pattern),
          ilike(abuseEvents.ip, pattern),
          ilike(abuseEvents.userId, pattern),
          ilike(users.gameName, pattern),
        ),
      )
      .orderBy(desc(abuseEvents.id))
      .limit(perLogLimit),
    db
      .select({
        id: economyEvents.id,
        userId: economyEvents.userId,
        gameName: users.gameName,
        eventType: economyEvents.eventType,
        itemKind: economyEvents.itemKind,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        detail: economyEvents.detail,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .leftJoin(users, eq(users.id, economyEvents.userId))
      .where(
        or(
          eventId ? eq(economyEvents.id, eventId) : undefined,
          ilike(economyEvents.eventType, pattern),
          ilike(economyEvents.itemKind, pattern),
          ilike(economyEvents.itemId, pattern),
          ilike(economyEvents.userId, pattern),
          ilike(users.gameName, pattern),
        ),
      )
      .orderBy(desc(economyEvents.id))
      .limit(perLogLimit),
    db
      .select({
        id: adminAuditLog.id,
        adminEmail: adminAuditLog.adminEmail,
        action: adminAuditLog.action,
        targetUserId: adminAuditLog.targetUserId,
        gameName: users.gameName,
        detail: adminAuditLog.detail,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .leftJoin(users, eq(users.id, adminAuditLog.targetUserId))
      .where(
        or(
          eventId ? eq(adminAuditLog.id, eventId) : undefined,
          ilike(adminAuditLog.adminEmail, pattern),
          ilike(adminAuditLog.action, pattern),
          ilike(adminAuditLog.targetUserId, pattern),
          ilike(users.gameName, pattern),
        ),
      )
      .orderBy(desc(adminAuditLog.id))
      .limit(perLogLimit),
    readRewardFailureStatuses(),
  ]);
  const rewardFailureStatusById = new Map(
    rewardFailureStatuses.map((entry) => [entry.eventId, entry.status]),
  );

  const entries = [
    ...abuseRows.map((row) => ({
      id: `abuse:${row.id}`,
      log: "abuse" as const,
      eventId: row.id,
      userId: row.userId,
      gameName: row.gameName,
      title: row.action,
      subtitle: row.reason,
      summary: summarizeDetail("abuse", row.detail),
      rewardFailureStatus: null,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
      href: `/admin?tab=abuse&${row.userId ? `userId=${encodeURIComponent(row.userId)}` : `ip=${encodeURIComponent(row.ip ?? "")}`}`,
      userHref: row.userId ? `/admin?tab=users&q=${encodeURIComponent(row.userId)}` : null,
    })),
    ...economyRows.map((row) => ({
      id: `economy:${row.id}`,
      log: "economy" as const,
      eventId: row.id,
      userId: row.userId,
      gameName: row.gameName,
      title: row.eventType,
      subtitle: [row.itemKind, row.itemId, row.quantity ?? null].filter(Boolean).join(" · "),
      summary: summarizeDetail("economy", row.detail),
      rewardFailureStatus: row.eventType.startsWith("reward.failure.")
        ? rewardFailureStatusById.get(row.id) ?? "open"
        : null,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
      href: `/admin?tab=economy&eventType=${encodeURIComponent(row.eventType)}`,
      userHref: row.userId ? `/admin?tab=users&q=${encodeURIComponent(row.userId)}` : null,
    })),
    ...auditRows.map((row) => ({
      id: `audit:${row.id}`,
      log: "audit" as const,
      eventId: row.id,
      userId: row.targetUserId,
      gameName: row.gameName,
      title: row.action,
      subtitle: row.adminEmail,
      summary: summarizeDetail("audit", row.detail),
      rewardFailureStatus: null,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
      href: `/admin?tab=audit&action=${encodeURIComponent(row.action)}`,
      userHref: row.targetUserId
        ? `/admin?tab=users&q=${encodeURIComponent(row.targetUserId)}`
        : null,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);

  if (format === "csv") {
    return new Response(csvRows(entries), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="ops-search-${Date.now()}.csv"`,
      },
    });
  }

  return Response.json({ ok: true, entries });
}

function csvRows(entries: Array<{
  log: string;
  eventId: number;
  createdAt: string;
  userId: string | null;
  gameName: string | null;
  title: string;
  subtitle: string;
  summary: string;
  rewardFailureStatus: string | null;
  href: string;
  userHref: string | null;
}>) {
  const columns = [
    "log",
    "eventId",
    "createdAt",
    "userId",
    "gameName",
    "title",
    "subtitle",
    "summary",
    "rewardFailureStatus",
    "href",
    "userHref",
  ] as const;
  return [
    columns.join(","),
    ...entries.map((entry) =>
      columns
        .map((column) => csvCell(entry[column] == null ? "" : String(entry[column])))
        .join(","),
    ),
  ].join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function summarizeDetail(kind: "abuse" | "economy" | "audit", raw: unknown) {
  const detail =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (kind === "economy") {
    const sourceEventId = detail.sourceEventId ? `원본 ${detail.sourceEventId}` : null;
    const before = detail.beforeBalance != null ? `이전 ${detail.beforeBalance}` : null;
    const after = detail.balance != null ? `이후 ${detail.balance}` : null;
    return [sourceEventId, before, after, textValue(detail.reason)].filter(Boolean).join(" · ");
  }
  if (kind === "audit") {
    const quantity = detail.quantity != null ? `수량 ${detail.quantity}` : null;
    const reason = textValue(detail.reason);
    const adminMemo = textValue(detail.adminMemo);
    return [quantity, reason, adminMemo].filter(Boolean).join(" · ");
  }
  return [textValue(detail.path), textValue(detail.message), textValue(detail.error)]
    .filter(Boolean)
    .join(" · ");
}

function textValue(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 160) : null;
}
