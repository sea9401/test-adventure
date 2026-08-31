import "server-only";

import { asc, inArray } from "drizzle-orm";
import { users } from "@/db/schema";
import {
  resolveTradeRestriction,
  tradeSuspendedPayload,
  type ActiveTradeRestriction,
  type TradeRestrictionFields,
} from "@/lib/tradeSuspension";
import type { DbExecutor } from "@/lib/server/savesKv";

export class TradeSuspendedError extends Error {
  readonly name = "TradeSuspendedError";

  constructor(readonly restriction: ActiveTradeRestriction) {
    super("trade_suspended");
  }
}

export function readTradeRestriction(
  fields: TradeRestrictionFields,
  now = new Date(),
): ActiveTradeRestriction | null {
  return resolveTradeRestriction(fields, now);
}

export async function lockTradeParticipantStatuses(
  tx: DbExecutor,
  userIds: readonly string[],
  now = new Date(),
): Promise<Map<string, ActiveTradeRestriction | null>> {
  const orderedIds = [...new Set(userIds)].sort();
  const statuses = new Map<string, ActiveTradeRestriction | null>(
    orderedIds.map((userId) => [userId, null]),
  );
  if (orderedIds.length === 0) return statuses;

  const rows = await tx
    .select({
      id: users.id,
      bannedUntil: users.bannedUntil,
      banReason: users.banReason,
      tradeSuspendedUntil: users.tradeSuspendedUntil,
      tradeSuspensionReason: users.tradeSuspensionReason,
    })
    .from(users)
    .where(inArray(users.id, orderedIds))
    .orderBy(asc(users.id))
    .for("update");

  for (const row of rows) {
    statuses.set(row.id, readTradeRestriction(row, now));
  }
  return statuses;
}

export async function requireTradeParticipants(
  tx: DbExecutor,
  userIds: readonly string[],
  now = new Date(),
): Promise<void> {
  const statuses = await lockTradeParticipantStatuses(tx, userIds, now);
  for (const userId of userIds) {
    const restriction = statuses.get(userId);
    if (restriction) throw new TradeSuspendedError(restriction);
  }
}

export function tradeSuspendedResponse(error: TradeSuspendedError): Response {
  return Response.json(tradeSuspendedPayload(error.restriction), { status: 403 });
}
