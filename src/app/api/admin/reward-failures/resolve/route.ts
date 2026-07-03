import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordEconomyEvent } from "@/lib/server/economyLog";
import {
  currentAdminEmail,
  requireAdminRole,
} from "@/lib/server/isAdmin";

export async function POST(req: Request) {
  const gate = await requireAdminRole("reward");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as
    | { eventIds?: unknown; note?: unknown }
    | null;
  const eventIds = Array.isArray(body?.eventIds)
    ? [...new Set(body.eventIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
        .slice(0, 100)
    : [];
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (eventIds.length === 0) {
    return Response.json({ ok: false, error: "eventIds required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: economyEvents.id,
      userId: economyEvents.userId,
      eventType: economyEvents.eventType,
      itemId: economyEvents.itemId,
      detail: economyEvents.detail,
    })
    .from(economyEvents)
    .where(inArray(economyEvents.id, eventIds))
    .limit(100);
  const failures = rows.filter((row) => row.eventType.startsWith("reward.failure."));
  if (failures.length === 0) {
    return Response.json({ ok: false, error: "reward failure events not found" }, { status: 404 });
  }

  const adminEmail = await currentAdminEmail();
  await logAdminAction({
    adminEmail,
    action: "reward-failure.review.bulk",
    detail: {
      requestedEventIds: eventIds,
      reviewedEventIds: failures.map((row) => row.id),
      note,
    },
  });
  await recordEconomyEvent({
    eventType: "admin.reward.failure.reviewed",
    itemKind: "failure_review",
    quantity: failures.length,
    detail: {
      adminEmail,
      eventIds: failures.map((row) => row.id),
      note,
    },
  });

  return Response.json({
    ok: true,
    reviewed: failures.length,
    eventIds: failures.map((row) => row.id),
  });
}
