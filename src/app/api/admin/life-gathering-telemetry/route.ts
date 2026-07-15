import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, economyEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import { LIFE_GATHERING_EVENT_TYPES } from "@/lib/server/lifeGatheringTelemetry";
import { aggregateLifeGatheringTelemetry } from "./aggregate";
import {
  ACTIVITY_GUARD_EVENT_REASONS,
  aggregateActivityGuardTelemetry,
} from "./verificationAggregate";

const ALLOWED_PERIOD_HOURS = new Set([24, 24 * 7, 24 * 30]);
const MAX_ROWS = 100_000;
const MAX_GUARD_ROWS = 20_000;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const requestedHours = Number(new URL(req.url).searchParams.get("hours"));
  const hours = ALLOWED_PERIOD_HOURS.has(requestedHours)
    ? requestedHours
    : 24 * 7;
  const until = new Date();
  const since = new Date(until.getTime() - hours * 60 * 60_000);

  const [rows, guardRows] = await Promise.all([
    db
      .select({
        userId: economyEvents.userId,
        gameName: users.gameName,
        eventType: economyEvents.eventType,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        detail: economyEvents.detail,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .leftJoin(users, eq(users.id, economyEvents.userId))
      .where(
        and(
          inArray(economyEvents.eventType, [...LIFE_GATHERING_EVENT_TYPES]),
          gte(economyEvents.createdAt, since),
        ),
      )
      .orderBy(desc(economyEvents.id))
      .limit(MAX_ROWS),
    db
      .select({
        userId: abuseEvents.userId,
        gameName: users.gameName,
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        detail: abuseEvents.detail,
        createdAt: abuseEvents.createdAt,
      })
      .from(abuseEvents)
      .leftJoin(users, eq(users.id, abuseEvents.userId))
      .where(
        and(
          inArray(abuseEvents.reason, [...ACTIVITY_GUARD_EVENT_REASONS]),
          gte(abuseEvents.createdAt, since),
        ),
      )
      .orderBy(desc(abuseEvents.id))
      .limit(MAX_GUARD_ROWS),
  ]);

  return Response.json({
    ok: true,
    hours,
    since: since.toISOString(),
    until: until.toISOString(),
    truncated: rows.length >= MAX_ROWS,
    guardTruncated: guardRows.length >= MAX_GUARD_ROWS,
    ...aggregateLifeGatheringTelemetry(rows),
    guard: aggregateActivityGuardTelemetry(guardRows),
  });
}
