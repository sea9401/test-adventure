import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);
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

  return Response.json({ ok: true, entries: rows });
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
