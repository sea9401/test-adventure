import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  economyEvents,
  guildActivityLog,
  guildMembers,
  guilds,
  savesKv,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import {
  buildAccountEconomyTrace,
  parseEconomyTraceDays,
  type EconomyTraceEventRow,
  type EconomyTraceGatheringRow,
  type EconomyTraceWarehouseRow,
} from "@/lib/server/accountEconomyTrace";

const MARKETPLACE_COUNTERPARTY_EVENTS = [
  "marketplace.buy",
  "marketplace.sell",
  "marketplace.auction.buy",
  "marketplace.auction.sell",
  "marketplace.buy_order.fill",
  "marketplace.buy_order.sell",
] as const;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const userQuery = sp.get("user")?.trim() ?? "";
  const days = parseEconomyTraceDays(sp.get("days"));
  if (!userQuery || days === null) {
    return Response.json(
      { ok: false, error: !userQuery ? "user_required" : "invalid_days" },
      { status: 400 },
    );
  }

  const account = (
    await db
      .select({
        userId: users.id,
        gameName: users.gameName,
        guildId: guildMembers.guildId,
        guildName: guilds.name,
        guildRole: guildMembers.role,
      })
      .from(users)
      .leftJoin(guildMembers, eq(guildMembers.userId, users.id))
      .leftJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(or(eq(users.id, userQuery), eq(users.gameName, userQuery)))
      .limit(1)
  )[0];
  if (!account) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60_000);
  const itemNameExpression = sql<string>`coalesce(${economyEvents.detail}->>'materialName', ${economyEvents.itemId})`;

  const [gatheringRaw, economyRaw, counterpartyRaw, warehouseRaw, characterRow] =
    await Promise.all([
      db
        .select({
          eventType: economyEvents.eventType,
          itemKind: economyEvents.itemKind,
          itemId: economyEvents.itemId,
          itemName: itemNameExpression,
          quantity: sql<number>`coalesce(sum(${economyEvents.quantity}), 0)`,
          events: sql<number>`count(*)`,
        })
        .from(economyEvents)
        .where(
          and(
            eq(economyEvents.userId, account.userId),
            gte(economyEvents.createdAt, since),
            lte(economyEvents.createdAt, until),
            sql`${economyEvents.eventType} like 'life.%.gather'`,
          ),
        )
        .groupBy(
          economyEvents.eventType,
          economyEvents.itemKind,
          economyEvents.itemId,
          itemNameExpression,
        ),
      db
        .select({
          eventType: economyEvents.eventType,
          itemKind: economyEvents.itemKind,
          itemId: economyEvents.itemId,
          quantity: sql<number>`coalesce(sum(${economyEvents.quantity}), 0)`,
          goldDelta: sql<number>`coalesce(sum(${economyEvents.goldDelta}), 0)`,
          events: sql<number>`count(*)`,
        })
        .from(economyEvents)
        .where(
          and(
            eq(economyEvents.userId, account.userId),
            gte(economyEvents.createdAt, since),
            lte(economyEvents.createdAt, until),
            sql`${economyEvents.eventType} not like 'life.%'`,
          ),
        )
        .groupBy(
          economyEvents.eventType,
          economyEvents.itemKind,
          economyEvents.itemId,
        ),
      db
        .select({
          eventType: economyEvents.eventType,
          itemKind: economyEvents.itemKind,
          itemId: economyEvents.itemId,
          quantity: sql<number>`coalesce(sum(${economyEvents.quantity}), 0)`,
          goldDelta: sql<number>`coalesce(sum(${economyEvents.goldDelta}), 0)`,
          events: sql<number>`count(*)`,
          counterpartyUserId: economyEvents.counterpartyUserId,
        })
        .from(economyEvents)
        .where(
          and(
            eq(economyEvents.userId, account.userId),
            gte(economyEvents.createdAt, since),
            lte(economyEvents.createdAt, until),
            isNotNull(economyEvents.counterpartyUserId),
            inArray(economyEvents.eventType, [
              ...MARKETPLACE_COUNTERPARTY_EVENTS,
            ]),
          ),
        )
        .groupBy(
          economyEvents.eventType,
          economyEvents.itemKind,
          economyEvents.itemId,
          economyEvents.counterpartyUserId,
        ),
      account.guildId === null
        ? Promise.resolve([])
        : db
            .select({
              type: guildActivityLog.type,
              itemKind: sql<string | null>`${guildActivityLog.meta}->>'itemKind'`,
              itemId: sql<string | null>`coalesce(${guildActivityLog.meta}->>'materialId', ${guildActivityLog.meta}->>'equipmentIid')`,
              itemName: sql<string | null>`${guildActivityLog.meta}->>'itemName'`,
              quantity: sql<number>`coalesce(sum((${guildActivityLog.meta}->>'quantity')::integer), 0)`,
              events: sql<number>`count(*)`,
            })
            .from(guildActivityLog)
            .where(
              and(
                eq(guildActivityLog.guildId, account.guildId),
                eq(guildActivityLog.actorUserId, account.userId),
                gte(guildActivityLog.createdAt, since),
                lte(guildActivityLog.createdAt, until),
                inArray(guildActivityLog.type, [
                  "warehouse_deposit",
                  "warehouse_withdraw",
                ]),
              ),
            )
            .groupBy(
              guildActivityLog.type,
              sql`${guildActivityLog.meta}->>'itemKind'`,
              sql`coalesce(${guildActivityLog.meta}->>'materialId', ${guildActivityLog.meta}->>'equipmentIid')`,
              sql`${guildActivityLog.meta}->>'itemName'`,
            ),
      db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(
            eq(savesKv.userId, account.userId),
            eq(savesKv.key, "character.v2"),
          ),
        )
        .limit(1),
    ]);

  const counterpartyIds = Array.from(
    new Set(
      counterpartyRaw
        .map((row) => row.counterpartyUserId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const counterpartyNames =
    counterpartyIds.length === 0
      ? new Map<string, string | null>()
      : new Map(
          (
            await db
              .select({ id: users.id, gameName: users.gameName })
              .from(users)
              .where(inArray(users.id, counterpartyIds))
          ).map((row) => [row.id, row.gameName] as const),
        );

  const character = record(characterRow[0]?.value);
  const materials = record(character.materials);
  const report = buildAccountEconomyTrace({
    account: {
      userId: account.userId,
      gameName: account.gameName ?? "모험가",
      guildId: account.guildId,
      guildName: account.guildName,
      guildRole: account.guildRole,
    },
    days,
    since: since.toISOString(),
    until: until.toISOString(),
    gatheringRows: gatheringRaw.map(normalizeGatheringRow),
    economyRows: economyRaw.map(normalizeEventRow),
    counterpartyRows: counterpartyRaw.map((row) => ({
      ...normalizeEventRow(row),
      counterpartyUserId: row.counterpartyUserId,
      counterpartyName:
        typeof row.counterpartyUserId === "string"
          ? (counterpartyNames.get(row.counterpartyUserId) ?? null)
          : null,
    })),
    warehouseRows: warehouseRaw.map(normalizeWarehouseRow),
    currentMaterials: Object.fromEntries(
      Object.entries(materials).map(([key, value]) => [key, integer(value)]),
    ),
    gold: integer(character.gold),
    bankedGold: integer(character.bankedGold),
  });

  return Response.json({ ok: true, report });
}

function normalizeGatheringRow(row: {
  eventType: string;
  itemKind: string | null;
  itemId: string | null;
  itemName: string | null;
  quantity: unknown;
  events: unknown;
}): EconomyTraceGatheringRow {
  return { ...row, quantity: integer(row.quantity), events: integer(row.events) };
}

function normalizeEventRow(row: {
  eventType: string;
  itemKind: string | null;
  itemId: string | null;
  quantity: unknown;
  goldDelta: unknown;
  events: unknown;
}): EconomyTraceEventRow {
  return {
    eventType: row.eventType,
    itemKind: row.itemKind,
    itemId: row.itemId,
    quantity: integer(row.quantity),
    goldDelta: integer(row.goldDelta),
    events: integer(row.events),
  };
}

function normalizeWarehouseRow(row: {
  type: string;
  itemKind: string | null;
  itemId: string | null;
  itemName: string | null;
  quantity: unknown;
  events: unknown;
}): EconomyTraceWarehouseRow {
  return {
    ...row,
    quantity: integer(row.quantity),
    events: integer(row.events),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isSafeInteger(number) ? number : 0;
}
