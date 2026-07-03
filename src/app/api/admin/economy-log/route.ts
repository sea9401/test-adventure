import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);
  const format = sp.get("format")?.trim().toLowerCase() || "json";
  const userId = sp.get("userId")?.trim() || null;
  const eventType = sp.get("eventType")?.trim() || null;
  const itemKind = sp.get("itemKind")?.trim() || null;
  const itemId = sp.get("itemId")?.trim() || null;
  const since = parseDateParam(sp.get("since"));
  const until = parseDateParam(sp.get("until"));

  const filters: SQL[] = [];
  if (userId) filters.push(eq(economyEvents.userId, userId));
  if (eventType) filters.push(eq(economyEvents.eventType, eventType));
  if (itemKind) filters.push(eq(economyEvents.itemKind, itemKind));
  if (itemId) filters.push(eq(economyEvents.itemId, itemId));
  if (since) filters.push(gte(economyEvents.createdAt, since));
  if (until) filters.push(lte(economyEvents.createdAt, until));

  const rows = await db
    .select({
      id: economyEvents.id,
      userId: economyEvents.userId,
      gameName: users.gameName,
      counterpartyUserId: economyEvents.counterpartyUserId,
      eventType: economyEvents.eventType,
      goldDelta: economyEvents.goldDelta,
      itemKind: economyEvents.itemKind,
      itemId: economyEvents.itemId,
      quantity: economyEvents.quantity,
      detail: economyEvents.detail,
      createdAt: economyEvents.createdAt,
    })
    .from(economyEvents)
    .leftJoin(users, eq(users.id, economyEvents.userId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(economyEvents.id))
    .limit(limit);

  if (format === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="economy-log-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  }

  return Response.json({ ok: true, entries: rows, summary: summarize(rows) });
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function summarize(
  rows: Array<{
    userId: string | null;
    gameName: string | null;
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    quantity: number | null;
    createdAt: Date;
  }>,
) {
  const currencies = new Map<string, { in: number; out: number; count: number }>();
  const events = new Map<string, number>();
  const usersByGold = new Map<
    string,
    { gameName: string | null; goldIn: number; goldOut: number; count: number }
  >();
  const hourly = new Map<string, { count: number; goldIn: number; goldOut: number }>();

  for (const row of rows) {
    events.set(row.eventType, (events.get(row.eventType) ?? 0) + 1);
    const hourKey = row.createdAt.toISOString().slice(0, 13) + ":00";
    const hour = hourly.get(hourKey) ?? { count: 0, goldIn: 0, goldOut: 0 };
    hour.count += 1;
    hour.goldIn += Math.max(0, row.goldDelta);
    hour.goldOut += Math.abs(Math.min(0, row.goldDelta));
    hourly.set(hourKey, hour);

    if (row.goldDelta !== 0) {
      addCurrency(currencies, "gold", row.goldDelta);
    }
    if (row.itemKind && row.quantity && !(row.itemKind === "gold" && row.goldDelta !== 0)) {
      addCurrency(currencies, row.itemKind, row.quantity);
    }

    if (row.userId) {
      const user =
        usersByGold.get(row.userId) ??
        { gameName: row.gameName, goldIn: 0, goldOut: 0, count: 0 };
      user.gameName = row.gameName ?? user.gameName;
      user.goldIn += Math.max(0, row.goldDelta);
      user.goldOut += Math.abs(Math.min(0, row.goldDelta));
      user.count += 1;
      usersByGold.set(row.userId, user);
    }
  }

  return {
    currencies: [...currencies.entries()]
      .map(([key, value]) => ({ key, ...value, net: value.in - value.out }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.count - a.count)
      .slice(0, 12),
    events: [...events.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([key, count]) => ({ key, count })),
    usersByGold: [...usersByGold.entries()]
      .map(([userId, value]) => ({
        userId,
        gameName: value.gameName,
        goldIn: value.goldIn,
        goldOut: value.goldOut,
        net: value.goldIn - value.goldOut,
        count: value.count,
      }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.count - a.count)
      .slice(0, 10),
    hourly: [...hourly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, value]) => ({ hour, ...value })),
  };
}

function addCurrency(
  currencies: Map<string, { in: number; out: number; count: number }>,
  key: string,
  delta: number,
) {
  const value = currencies.get(key) ?? { in: 0, out: 0, count: 0 };
  value.in += Math.max(0, delta);
  value.out += Math.abs(Math.min(0, delta));
  value.count += 1;
  currencies.set(key, value);
}

function toCsv(
  rows: Array<{
    id: number;
    userId: string | null;
    gameName: string | null;
    counterpartyUserId: string | null;
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    itemId: string | null;
    quantity: number | null;
    detail: unknown;
    createdAt: Date;
  }>,
) {
  const header = [
    "id",
    "createdAt",
    "userId",
    "gameName",
    "counterpartyUserId",
    "eventType",
    "goldDelta",
    "itemKind",
    "itemId",
    "quantity",
    "detail",
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      row.userId ?? "",
      row.gameName ?? "",
      row.counterpartyUserId ?? "",
      row.eventType,
      row.goldDelta,
      row.itemKind ?? "",
      row.itemId ?? "",
      row.quantity ?? "",
      row.detail ? JSON.stringify(row.detail) : "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
