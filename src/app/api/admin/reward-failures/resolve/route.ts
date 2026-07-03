import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { economyEvents } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import { recordEconomyEvent } from "@/lib/server/economyLog";
import {
  currentAdminEmail,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import {
  readRewardFailureStatuses,
  type RewardFailureStatus,
  writeRewardFailureStatuses,
} from "@/lib/server/opsSettings";

const STATUS_VALUES = ["reviewed", "compensated", "ignored"] as const;

export async function POST(req: Request) {
  const gate = await requireAdminRole("reward");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as
    | { eventIds?: unknown; note?: unknown; status?: unknown }
    | null;
  const eventIds = Array.isArray(body?.eventIds)
    ? [...new Set(body.eventIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
        .slice(0, 100)
    : [];
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  const status = isStatus(body?.status) ? body.status : "reviewed";
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
  const now = new Date();
  const previous = await readRewardFailureStatuses();
  const nextById = new Map(previous.map((entry) => [entry.eventId, entry]));
  for (const row of failures) {
    nextById.set(row.id, {
      eventId: row.id,
      status,
      note,
      adminEmail,
      updatedAt: now.toISOString(),
    });
  }
  await writeRewardFailureStatuses(
    [...nextById.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    adminEmail,
    now,
  );
  await logAdminAction({
    adminEmail,
    action: `reward-failure.${status}.bulk`,
    detail: {
      requestedEventIds: eventIds,
      reviewedEventIds: failures.map((row) => row.id),
      status,
      note,
    },
  });
  await recordEconomyEvent({
    eventType: `admin.reward.failure.${status}`,
    itemKind: "failure_review",
    quantity: failures.length,
    detail: {
      adminEmail,
      eventIds: failures.map((row) => row.id),
      status,
      note,
    },
  });

  return Response.json({
    ok: true,
    status,
    reviewed: failures.length,
    eventIds: failures.map((row) => row.id),
  });
}

function isStatus(value: unknown): value is RewardFailureStatus {
  return typeof value === "string" && (STATUS_VALUES as readonly string[]).includes(value);
}
